// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {FixedMath} from "./math/FixedMath.sol";
import {SviPricing} from "./pricing/SviPricing.sol";
import {SviPricer} from "./pricing/SviPricer.sol";
import {LiabilityTree} from "./lib/LiabilityTree.sol";
import {IMezoPriceOracle} from "./interfaces/IMezoPriceOracle.sol";

/// @title YosukuPredict
/// @notice Yosuku's prediction venue on Mezo: oracle-settled, SVI-priced BTC range digitals paid in
///         MUSD, with an LP vault as the counterparty. The EVM counterpart of DeepBook Predict's
///         expiry markets + PLP vault that Yosuku trades on Sui.
///
///         A position pays `quantity` MUSD if BTC settles in `(lower, higher]`, where the bounds are
///         ticks on the market's strike grid (tick 0 = -inf, POS_INF_TICK = +inf). Entry cost is
///         `quantity * P(range)` from the SVI surface, plus a fee.
///
/// @dev Design notes (see docs/MEZO_PORT.md):
///      - Spot comes from Mezo's native oracle precompile, fresh every block. Volatility (SVI) and the
///        forward basis are pushed per market by a KEEPER, the role Block Scholes plays for DeepBook.
///      - Each market has a 256-tick grid. `LiabilityTree` tracks the exact payout for every
///        settlement bucket, so worst-case exposure is known after every trade.
///      - Solvency: the sum of every live market's worst case never exceeds `maxUtilization` of LP
///        capital (checked on mint), nor LP capital itself (checked on redeem).
///      - LP deposits/withdrawals are requested during an epoch and priced when it rolls. Every
///        market expires inside its epoch and the epoch cannot roll until all are settled, so the
///        share price is always computed with zero open risk: no mark-to-market needed.
///      - Settlement reads the first oracle print at or after expiry within `settleWindow`. Missing
///        the window voids the market and refunds premiums.
contract YosukuPredict is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using LiabilityTree for LiabilityTree.Tree;

    // ───────────────────────── constants ─────────────────────────

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant F = 1e9;
    uint32 public constant NEG_INF_TICK = 0;
    uint32 public constant POS_INF_TICK = (1 << 30) - 1; // DeepBook `pos_inf_tick`
    uint32 public constant GRID_TICKS = 256;
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant MAX_QUANTITY = type(uint96).max;

    // ───────────────────────── types ─────────────────────────

    enum Status {
        None,
        Live,
        Settled,
        Void
    }

    struct Market {
        uint64 expiry; // unix seconds
        uint64 epoch;
        uint64 tickSize; // 1e9-scaled USD per tick
        uint32 minTick; // lowest finite tick on the grid
        Status status;
        uint64 settlementPrice; // 1e9-scaled USD
        uint128 maxLiability; // worst-case payout, MUSD wei
        uint128 totalPremium; // premiums of open positions (void refund basis)
        uint128 owed; // unclaimed payouts after settlement
    }

    struct Vol {
        uint64 spotRef; // 1e9 spot the forward was quoted against
        uint64 forward; // 1e9 forward for this expiry
        uint64 modelTimestamp; // unix seconds the surface was fit at
        SviPricing.RawSVI svi;
    }

    struct Position {
        address owner;
        uint64 marketId;
        uint32 lowerTick;
        uint32 higherTick;
        bool open;
        uint128 quantity;
        uint128 premium;
    }

    struct Config {
        address treasury; // fee recipient; `address(this)` keeps fees for LPs
        uint32 volMaxAge; // seconds a pushed surface stays usable
        uint32 spotMaxAge; // seconds an oracle print stays usable for pricing
        uint32 settleWindow; // seconds after expiry settlement is allowed
        uint64 feeRate; // 1e9, charged on premium (mint) and proceeds (redeem)
        uint64 minEntryPrice; // 1e9 probability floor for new positions
        uint64 maxEntryPrice; // 1e9 probability ceiling for new positions
        uint64 maxUtilization; // 1e9 share of LP capital that worst-case payouts may reach
        uint128 lotSize; // quantity granularity, MUSD wei
        uint128 minPremium; // smallest premium accepted, MUSD wei
        uint128 minDeposit; // smallest LP deposit, MUSD wei
    }

    struct EpochFlow {
        uint256 depositAssets;
        uint256 withdrawShares;
        uint256 mintedShares;
        uint256 releasedAssets;
        bool rolled;
    }

    // ───────────────────────── storage ─────────────────────────

    IERC20 public immutable musd;
    IMezoPriceOracle public immutable spotOracle;
    uint256 public immutable oracleScale; // divide oracle answers by this to reach 1e9
    uint64 public immutable genesis;
    uint64 public immutable epochLength;

    Config public config;

    uint64 public marketCount;
    uint256 public positionCount;
    uint64 public currentEpoch;

    mapping(uint64 => Market) public markets;
    mapping(uint64 => Vol) internal _vols;
    mapping(uint64 => LiabilityTree.Tree) internal _liability;
    mapping(uint256 => Position) public positions;

    mapping(uint64 => uint256) public epochUnsettled;
    mapping(uint64 => EpochFlow) public epochFlow;
    mapping(uint64 => mapping(address => uint256)) public pendingDepositOf;
    mapping(uint64 => mapping(address => uint256)) public pendingWithdrawOf;

    uint256 public liveMaxLiability; // Σ worst case over live markets
    uint256 public owedTotal; // Σ unclaimed payouts over settled/void markets
    uint256 public pendingDepositAssets; // MUSD waiting for an epoch roll
    uint256 public reservedWithdrawalAssets; // MUSD released to withdrawers, not yet claimed

    // ───────────────────────── events ─────────────────────────

    event ConfigUpdated(Config config);
    event MarketCreated(uint64 indexed marketId, uint64 indexed epoch, uint64 expiry, uint64 tickSize, uint32 minTick);
    event VolUpdated(uint64 indexed marketId, uint64 spotRef, uint64 forward, uint64 modelTimestamp);
    event Minted(
        uint256 indexed positionId,
        uint64 indexed marketId,
        address indexed owner,
        uint32 lowerTick,
        uint32 higherTick,
        uint256 quantity,
        uint256 price,
        uint256 premium,
        uint256 fee
    );
    event Redeemed(uint256 indexed positionId, address indexed owner, uint256 price, uint256 proceeds, uint256 fee);
    event Settled(uint64 indexed marketId, uint64 settlementPrice, uint256 payout);
    event Voided(uint64 indexed marketId, uint256 refund);
    event Claimed(uint256 indexed positionId, address indexed owner, uint256 payout);
    event DepositRequested(uint64 indexed epoch, address indexed lp, uint256 assets);
    event WithdrawRequested(uint64 indexed epoch, address indexed lp, uint256 shares);
    event EpochRolled(uint64 indexed epoch, uint256 nav, uint256 supply, uint256 releasedAssets, uint256 mintedShares);
    event DepositClaimed(uint64 indexed epoch, address indexed lp, uint256 shares);
    event WithdrawClaimed(uint64 indexed epoch, address indexed lp, uint256 assets);

    // ───────────────────────── errors ─────────────────────────

    error BadConfig();
    error BadMarket();
    error MarketNotLive();
    error MarketClosed();
    error MarketNotResolved();
    error BadRange();
    error BadQuantity();
    error PriceOutOfBand();
    error PremiumTooSmall();
    error Slippage();
    error ExposureLimit();
    error VolStale();
    error SpotStale();
    error AwaitingOraclePrint();
    error NotPositionOwner();
    error PositionClosed();
    error EpochNeedsRoll();
    error EpochNotOver();
    error EpochHasOpenMarkets();
    error EpochNotRolled();
    error NothingToClaim();
    error DepositTooSmall();

    // ───────────────────────── constructor ─────────────────────────

    /// @param oracleDecimals_ decimals of `spotOracle_` answers (18 for Mezo's precompile). Passed in
    ///        rather than read, because deploy tooling simulates locally and cannot execute Mezo's
    ///        native precompiles.
    constructor(
        IERC20 musd_,
        IMezoPriceOracle spotOracle_,
        uint8 oracleDecimals_,
        address admin,
        uint64 genesis_,
        uint64 epochLength_,
        Config memory config_
    ) ERC20("Yosuku LP", "yLP") {
        if (address(musd_) == address(0) || address(spotOracle_) == address(0) || admin == address(0)) {
            revert BadConfig();
        }
        if (epochLength_ == 0 || genesis_ > block.timestamp) revert BadConfig();
        musd = musd_;
        spotOracle = spotOracle_;
        if (oracleDecimals_ < 9 || oracleDecimals_ > 36) revert BadConfig();
        oracleScale = 10 ** (oracleDecimals_ - 9);
        genesis = genesis_;
        epochLength = epochLength_;
        currentEpoch = uint64((block.timestamp - genesis_) / epochLength_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setConfig(config_);
    }

    // ───────────────────────── admin ─────────────────────────

    function setConfig(Config calldata config_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setConfig(config_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ───────────────────────── keeper ─────────────────────────

    /// @notice Open a market expiring at `expiry` with a 256-tick grid starting at `minTick`.
    function createMarket(uint64 expiry, uint64 tickSize, uint32 minTick)
        external
        onlyRole(KEEPER_ROLE)
        returns (uint64)
    {
        return _createMarket(expiry, tickSize, minTick);
    }

    /// @notice Open a market whose grid is centred on the live spot.
    function createMarketAtSpot(uint64 expiry, uint64 tickSize) external onlyRole(KEEPER_ROLE) returns (uint64) {
        if (tickSize == 0) revert BadMarket();
        uint256 spotTick = spotPrice() / tickSize;
        uint256 half = GRID_TICKS / 2;
        uint32 minTick = SafeCast.toUint32(spotTick > half ? spotTick - half : 1);
        return _createMarket(expiry, tickSize, minTick);
    }

    function _createMarket(uint64 expiry, uint64 tickSize, uint32 minTick) internal returns (uint64 marketId) {
        uint64 epoch = currentEpoch;
        uint256 end = epochEnd(epoch);
        if (block.timestamp >= end) revert EpochNeedsRoll();
        if (expiry <= block.timestamp || expiry > end) revert BadMarket();
        if (tickSize == 0 || minTick == NEG_INF_TICK) revert BadMarket();
        uint256 topTick = uint256(minTick) + GRID_TICKS - 1;
        if (topTick >= POS_INF_TICK || topTick * tickSize > type(uint64).max) revert BadMarket();

        marketId = ++marketCount;
        Market storage m = markets[marketId];
        m.expiry = expiry;
        m.epoch = epoch;
        m.tickSize = tickSize;
        m.minTick = minTick;
        m.status = Status.Live;
        ++epochUnsettled[epoch];
        emit MarketCreated(marketId, epoch, expiry, tickSize, minTick);
    }

    /// @notice Publish the volatility surface and forward for a live market.
    function pushVol(uint64 marketId, uint64 spotRef, uint64 forward, uint64 modelTimestamp, SviPricing.RawSVI calldata svi)
        external
        onlyRole(KEEPER_ROLE)
    {
        Market storage m = _live(marketId);
        if (modelTimestamp > block.timestamp || modelTimestamp >= m.expiry) revert VolStale();
        SviPricing.assertInputsPricingSafe(spotRef, forward, svi);
        Vol storage v = _vols[marketId];
        v.spotRef = spotRef;
        v.forward = forward;
        v.modelTimestamp = modelTimestamp;
        v.svi = svi;
        emit VolUpdated(marketId, spotRef, forward, modelTimestamp);
    }

    // ───────────────────────── trading ─────────────────────────

    /// @notice Price `quantity` of the range `(lower, higher]` right now.
    function quote(uint64 marketId, uint32 lowerTick, uint32 higherTick, uint256 quantity)
        public
        view
        returns (uint256 price, uint256 premium, uint256 fee)
    {
        Market storage m = _live(marketId);
        _validateRange(m, lowerTick, higherTick);
        price = rangePriceOf(marketId, lowerTick, higherTick);
        premium = FixedMath.mulDivUp(quantity, price, F);
        fee = FixedMath.mulDivUp(premium, config.feeRate, F);
    }

    /// @notice Buy a range digital. Pulls `premium + fee` MUSD; reverts if that exceeds `maxCost`.
    function mint(uint64 marketId, uint32 lowerTick, uint32 higherTick, uint256 quantity, uint256 maxCost)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        Market storage m = _live(marketId);
        if (block.timestamp >= m.expiry) revert MarketClosed();
        if (quantity == 0 || quantity > MAX_QUANTITY || quantity % config.lotSize != 0) revert BadQuantity();

        (uint256 price, uint256 premium, uint256 fee) = quote(marketId, lowerTick, higherTick, quantity);
        if (price < config.minEntryPrice || price > config.maxEntryPrice) revert PriceOutOfBand();
        if (premium < config.minPremium) revert PremiumTooSmall();
        if (premium + fee > maxCost) revert Slippage();

        _applyLiability(marketId, m, lowerTick, higherTick, SafeCast.toInt256(quantity));
        m.totalPremium += SafeCast.toUint128(premium);

        musd.safeTransferFrom(msg.sender, address(this), premium + fee);
        _payFee(fee);
        _assertExposure(config.maxUtilization);

        positionId = ++positionCount;
        positions[positionId] = Position({
            owner: msg.sender,
            marketId: marketId,
            lowerTick: lowerTick,
            higherTick: higherTick,
            open: true,
            quantity: SafeCast.toUint128(quantity),
            premium: SafeCast.toUint128(premium)
        });
        emit Minted(positionId, marketId, msg.sender, lowerTick, higherTick, quantity, price, premium, fee);
    }

    /// @notice What closing a position early would pay right now.
    function quoteRedeem(uint256 positionId) public view returns (uint256 price, uint256 proceeds, uint256 fee) {
        Position storage p = positions[positionId];
        if (!p.open) revert PositionClosed();
        price = rangePriceOf(p.marketId, p.lowerTick, p.higherTick);
        uint256 gross = FixedMath.mulDivDown(p.quantity, price, F);
        fee = FixedMath.mulDivUp(gross, config.feeRate, F);
        if (fee > gross) fee = gross;
        proceeds = gross - fee;
    }

    /// @notice Close a position before expiry at the live price.
    function redeem(uint256 positionId, uint256 minProceeds)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 proceeds)
    {
        Position storage p = positions[positionId];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (!p.open) revert PositionClosed();
        Market storage m = _live(p.marketId);
        if (block.timestamp >= m.expiry) revert MarketClosed();

        uint256 price;
        uint256 fee;
        (price, proceeds, fee) = quoteRedeem(positionId);
        if (proceeds < minProceeds) revert Slippage();

        p.open = false;
        _applyLiability(p.marketId, m, p.lowerTick, p.higherTick, -SafeCast.toInt256(uint256(p.quantity)));
        m.totalPremium -= p.premium;

        _payFee(fee);
        if (proceeds > 0) musd.safeTransfer(msg.sender, proceeds);
        _assertExposure(F);
        emit Redeemed(positionId, msg.sender, price, proceeds, fee);
    }

    // ───────────────────────── resolution ─────────────────────────

    /// @notice Settle an expired market from the first oracle print at or after expiry. Anyone can
    ///         call. After `settleWindow` without a print the market voids and premiums refund.
    function settle(uint64 marketId) external nonReentrant {
        Market storage m = _live(marketId);
        if (block.timestamp < m.expiry) revert MarketNotResolved();

        uint256 owed;
        if (block.timestamp > uint256(m.expiry) + config.settleWindow) {
            m.status = Status.Void;
            owed = m.totalPremium;
            emit Voided(marketId, owed);
        } else {
            (uint256 price, uint256 updatedAt) = _readSpot();
            if (updatedAt < m.expiry) revert AwaitingOraclePrint();
            m.status = Status.Settled;
            m.settlementPrice = SafeCast.toUint64(price);
            owed = SafeCast.toUint256(_liability[marketId].at(_settlementBucket(m, price)));
            emit Settled(marketId, m.settlementPrice, owed);
        }

        m.owed = SafeCast.toUint128(owed);
        owedTotal += owed;
        liveMaxLiability -= m.maxLiability;
        --epochUnsettled[m.epoch];
    }

    /// @notice Collect a resolved position: `quantity` if it won, its premium if the market voided.
    function claim(uint256 positionId) public nonReentrant returns (uint256 payout) {
        Position storage p = positions[positionId];
        if (!p.open) revert PositionClosed();
        Market storage m = markets[p.marketId];
        if (m.status == Status.Settled) {
            if (settlementInRange(p.lowerTick, p.higherTick, m.settlementPrice, m.tickSize)) payout = p.quantity;
        } else if (m.status == Status.Void) {
            payout = p.premium;
        } else {
            revert MarketNotResolved();
        }

        p.open = false;
        if (payout > 0) {
            m.owed -= SafeCast.toUint128(payout);
            owedTotal -= payout;
            musd.safeTransfer(p.owner, payout);
        }
        emit Claimed(positionId, p.owner, payout);
    }

    function claimMany(uint256[] calldata positionIds) external returns (uint256 total) {
        for (uint256 i = 0; i < positionIds.length; ++i) {
            total += claim(positionIds[i]);
        }
    }

    // ───────────────────────── LP vault ─────────────────────────

    /// @notice Queue MUSD to join the LP pool at the next epoch roll.
    function requestDeposit(uint256 assets) external nonReentrant whenNotPaused {
        if (assets < config.minDeposit) revert DepositTooSmall();
        uint64 epoch = currentEpoch;
        musd.safeTransferFrom(msg.sender, address(this), assets);
        pendingDepositOf[epoch][msg.sender] += assets;
        epochFlow[epoch].depositAssets += assets;
        pendingDepositAssets += assets;
        emit DepositRequested(epoch, msg.sender, assets);
    }

    /// @notice Queue LP shares to leave at the next epoch roll. Never paused.
    function requestWithdraw(uint256 shares) external nonReentrant {
        if (shares == 0) revert NothingToClaim();
        uint64 epoch = currentEpoch;
        _transfer(msg.sender, address(this), shares);
        pendingWithdrawOf[epoch][msg.sender] += shares;
        epochFlow[epoch].withdrawShares += shares;
        emit WithdrawRequested(epoch, msg.sender, shares);
    }

    /// @notice Close the current epoch once it has ended and every market in it is resolved, then
    ///         price its queued deposits and withdrawals at the risk-free NAV. Anyone can call.
    function rollEpoch() external nonReentrant {
        uint64 epoch = currentEpoch;
        if (block.timestamp < epochEnd(epoch)) revert EpochNotOver();
        if (epochUnsettled[epoch] != 0) revert EpochHasOpenMarkets();

        EpochFlow storage f = epochFlow[epoch];
        uint256 nav = navAssets();
        uint256 supply = totalSupply();

        uint256 released;
        if (f.withdrawShares > 0) {
            released = (f.withdrawShares * nav) / supply;
            _burn(address(this), f.withdrawShares);
            reservedWithdrawalAssets += released;
        }

        uint256 minted;
        if (f.depositAssets > 0) {
            uint256 navAfter = nav - released;
            uint256 supplyAfter = supply - f.withdrawShares;
            minted = (f.depositAssets * (supplyAfter + VIRTUAL_SHARES)) / (navAfter + 1);
            pendingDepositAssets -= f.depositAssets;
            _mint(address(this), minted);
        }

        f.mintedShares = minted;
        f.releasedAssets = released;
        f.rolled = true;
        currentEpoch = uint64((block.timestamp - genesis) / epochLength);
        emit EpochRolled(epoch, nav, supply, released, minted);
    }

    function claimDeposit(uint64 epoch) external nonReentrant returns (uint256 shares) {
        EpochFlow storage f = epochFlow[epoch];
        if (!f.rolled) revert EpochNotRolled();
        uint256 assets = pendingDepositOf[epoch][msg.sender];
        if (assets == 0) revert NothingToClaim();
        pendingDepositOf[epoch][msg.sender] = 0;
        shares = (assets * f.mintedShares) / f.depositAssets;
        _transfer(address(this), msg.sender, shares);
        emit DepositClaimed(epoch, msg.sender, shares);
    }

    function claimWithdraw(uint64 epoch) external nonReentrant returns (uint256 assets) {
        EpochFlow storage f = epochFlow[epoch];
        if (!f.rolled) revert EpochNotRolled();
        uint256 shares = pendingWithdrawOf[epoch][msg.sender];
        if (shares == 0) revert NothingToClaim();
        pendingWithdrawOf[epoch][msg.sender] = 0;
        assets = (shares * f.releasedAssets) / f.withdrawShares;
        reservedWithdrawalAssets -= assets;
        musd.safeTransfer(msg.sender, assets);
        emit WithdrawClaimed(epoch, msg.sender, assets);
    }

    // ───────────────────────── views ─────────────────────────

    /// @notice LP capital: everything held except queued deposits, released withdrawals and payouts
    ///         owed to traders. Includes premiums of live markets.
    function navAssets() public view returns (uint256) {
        return musd.balanceOf(address(this)) - pendingDepositAssets - reservedWithdrawalAssets - owedTotal;
    }

    function epochEnd(uint64 epoch) public view returns (uint256) {
        return uint256(genesis) + (uint256(epoch) + 1) * epochLength;
    }

    /// @notice Live BTC/USD at 1e9, reverting if the print is stale.
    function spotPrice() public view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = _readSpot();
        if (updatedAt + config.spotMaxAge < block.timestamp) revert SpotStale();
    }

    /// @notice P(settle in (lower, higher]) under the live surface, 1e9-scaled.
    function rangePriceOf(uint64 marketId, uint32 lowerTick, uint32 higherTick) public view returns (uint256) {
        (SviPricing.PricingSVI memory svi, uint256 forward) = livePricer(marketId);
        Market storage m = markets[marketId];
        return SviPricer.rangePrice(svi, forward, _strikeOf(m, lowerTick), _strikeOf(m, higherTick));
    }

    /// @notice The rolled-down surface and re-anchored forward a trade would price against now.
    function livePricer(uint64 marketId) public view returns (SviPricing.PricingSVI memory svi, uint256 forward) {
        Market storage m = markets[marketId];
        Vol storage v = _vols[marketId];
        if (block.timestamp >= m.expiry) revert MarketClosed();
        if (v.modelTimestamp == 0 || block.timestamp - v.modelTimestamp > config.volMaxAge) revert VolStale();
        // Re-anchor the published basis on the live spot, as DeepBook does with a fresh Pyth print.
        forward = FixedMath.mulDivDown(spotPrice(), v.forward, v.spotRef);
        svi = SviPricing.rollDown(v.svi, v.modelTimestamp, m.expiry, block.timestamp);
    }

    function vol(uint64 marketId) external view returns (Vol memory) {
        return _vols[marketId];
    }

    function _strikeOf(Market storage m, uint32 tick) internal view returns (uint256) {
        if (tick == NEG_INF_TICK) return SviPricing.NEG_INF;
        if (tick == POS_INF_TICK) return SviPricing.POS_INF;
        return uint256(tick) * m.tickSize;
    }

    /// @notice Worst-case payout of a market and the payout at a given settlement bucket.
    function liabilityAt(uint64 marketId, uint256 bucket) external view returns (uint256) {
        return SafeCast.toUint256(_liability[marketId].at(bucket));
    }

    /// @notice DeepBook `range_codec::settlement_in_range`: pays on `(lower, higher]`.
    function settlementInRange(uint32 lowerTick, uint32 higherTick, uint256 settlement, uint256 tickSize)
        public
        pure
        returns (bool)
    {
        uint256 limit = (settlement + tickSize - 1) / tickSize; // smallest tick with strike >= settlement
        return lowerTick < limit && (higherTick == POS_INF_TICK || limit <= higherTick);
    }

    // ───────────────────────── internal ─────────────────────────

    function _setConfig(Config memory c) internal {
        if (c.treasury == address(0) || c.lotSize == 0) revert BadConfig();
        if (c.feeRate > F / 10 || c.maxUtilization == 0 || c.maxUtilization > F) revert BadConfig();
        if (c.minEntryPrice > c.maxEntryPrice || c.maxEntryPrice > F) revert BadConfig();
        if (c.settleWindow == 0 || c.volMaxAge == 0 || c.spotMaxAge == 0) revert BadConfig();
        config = c;
        emit ConfigUpdated(c);
    }

    function _live(uint64 marketId) internal view returns (Market storage m) {
        m = markets[marketId];
        if (m.status != Status.Live) revert MarketNotLive();
    }

    function _validateRange(Market storage m, uint32 lowerTick, uint32 higherTick) internal view {
        uint32 top = m.minTick + GRID_TICKS - 1;
        bool lowerOk = lowerTick == NEG_INF_TICK || (lowerTick >= m.minTick && lowerTick <= top);
        bool higherOk = higherTick == POS_INF_TICK || (higherTick >= m.minTick && higherTick <= top);
        if (!lowerOk || !higherOk || lowerTick >= higherTick) revert BadRange();
        if (lowerTick == NEG_INF_TICK && higherTick == POS_INF_TICK) revert BadRange();
    }

    /// @dev Bucket index of a boundary: -inf → 0, finite t → t - minTick + 1, +inf → 257.
    ///      A range `(lower, higher]` pays in buckets `[idx(lower), idx(higher) - 1]`.
    function _boundaryIndex(Market storage m, uint32 tick) internal view returns (uint256) {
        if (tick == NEG_INF_TICK) return 0;
        if (tick == POS_INF_TICK) return LiabilityTree.BUCKETS;
        return uint256(tick) - m.minTick + 1;
    }

    /// @dev Bucket a settlement price falls in, consistent with `settlementInRange`.
    function _settlementBucket(Market storage m, uint256 price) internal view returns (uint256) {
        uint256 limit = (price + m.tickSize - 1) / m.tickSize;
        if (limit <= m.minTick) return 0;
        uint256 offset = limit - m.minTick;
        return offset >= GRID_TICKS ? GRID_TICKS : offset;
    }

    function _applyLiability(uint64 marketId, Market storage m, uint32 lowerTick, uint32 higherTick, int256 delta)
        internal
    {
        LiabilityTree.Tree storage tree = _liability[marketId];
        tree.rangeAdd(_boundaryIndex(m, lowerTick), _boundaryIndex(m, higherTick) - 1, delta);
        uint256 newMax = SafeCast.toUint256(tree.max());
        liveMaxLiability = liveMaxLiability - m.maxLiability + newMax;
        m.maxLiability = SafeCast.toUint128(newMax);
    }

    /// @dev Worst case across live markets must stay within `utilization` of LP capital.
    function _assertExposure(uint256 utilization) internal view {
        if (liveMaxLiability * F > navAssets() * utilization) revert ExposureLimit();
    }

    function _payFee(uint256 fee) internal {
        address treasury = config.treasury;
        if (fee > 0 && treasury != address(this)) musd.safeTransfer(treasury, fee);
    }

    function _readSpot() internal view returns (uint256 price, uint256 updatedAt) {
        (, int256 answer,, uint256 ts,) = spotOracle.latestRoundData();
        if (answer <= 0) revert SpotStale();
        // forge-lint: disable-next-line(unsafe-typecast) -- answer > 0 checked above
        return (uint256(answer) / oracleScale, ts);
    }
}
