// @generated from contracts/ (forge inspect YosukuPredict abi). Do not edit by hand.
// Regenerate: npm run abi (at the repo root)
export const yosukuPredictAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "musd_",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "spotOracle_",
        "type": "address",
        "internalType": "contract IMezoPriceOracle"
      },
      {
        "name": "oracleDecimals_",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "genesis_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "epochLength_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "config_",
        "type": "tuple",
        "internalType": "struct YosukuPredict.Config",
        "components": [
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "volMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "spotMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "settleWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "feeRate",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "minEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxUtilization",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lotSize",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minPremium",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minDeposit",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "F",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GRID_TICKS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KEEPER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "NEG_INF_TICK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PAUSER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POS_INF_TICK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "payout",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimDeposit",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimMany",
    "inputs": [
      {
        "name": "positionIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimWithdraw",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "config",
    "inputs": [],
    "outputs": [
      {
        "name": "treasury",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "volMaxAge",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "spotMaxAge",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "settleWindow",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "feeRate",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "minEntryPrice",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxEntryPrice",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxUtilization",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lotSize",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "minPremium",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "minDeposit",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createMarket",
    "inputs": [
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tickSize",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "minTick",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createMarketAtSpot",
    "inputs": [
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tickSize",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "currentEpoch",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "epochEnd",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "epochFlow",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "depositAssets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "withdrawShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "mintedShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "releasedAssets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "rolled",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "epochLength",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "epochUnsettled",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "genesis",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liabilityAt",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "bucket",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liveMaxLiability",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "livePricer",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "svi",
        "type": "tuple",
        "internalType": "struct SviPricing.PricingSVI",
        "components": [
          {
            "name": "aMagnitude",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "aNegative",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "b",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rho",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "m",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "sigma",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "forward",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "marketCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markets",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tickSize",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "minTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum YosukuPredict.Status"
      },
      {
        "name": "settlementPrice",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxLiability",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "totalPremium",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "owed",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lowerTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "quantity",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxCost",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "musd",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "navAssets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "oracleScale",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owedTotal",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingDepositAssets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingDepositOf",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingWithdrawOf",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "positionCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "positions",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lowerTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "open",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "quantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "premium",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pushVol",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "spotRef",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "forward",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "modelTimestamp",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "svi",
        "type": "tuple",
        "internalType": "struct SviPricing.RawSVI",
        "components": [
          {
            "name": "aMagnitude",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "aNegative",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "b",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rho",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "m",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "sigma",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "quote",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lowerTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "quantity",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premium",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteRedeem",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proceeds",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rangePriceOf",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lowerTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "redeem",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minProceeds",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "proceeds",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestDeposit",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestWithdraw",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reservedWithdrawalAssets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rollEpoch",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setConfig",
    "inputs": [
      {
        "name": "config_",
        "type": "tuple",
        "internalType": "struct YosukuPredict.Config",
        "components": [
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "volMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "spotMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "settleWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "feeRate",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "minEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxUtilization",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lotSize",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minPremium",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minDeposit",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlementInRange",
    "inputs": [
      {
        "name": "lowerTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "settlement",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tickSize",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "spotOracle",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IMezoPriceOracle"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "spotPrice",
    "inputs": [],
    "outputs": [
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vol",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct YosukuPredict.Vol",
        "components": [
          {
            "name": "spotRef",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "forward",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "modelTimestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "svi",
            "type": "tuple",
            "internalType": "struct SviPricing.RawSVI",
            "components": [
              {
                "name": "aMagnitude",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "aNegative",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "b",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "rho",
                "type": "int256",
                "internalType": "int256"
              },
              {
                "name": "m",
                "type": "int256",
                "internalType": "int256"
              },
              {
                "name": "sigma",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConfigUpdated",
    "inputs": [
      {
        "name": "config",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct YosukuPredict.Config",
        "components": [
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "volMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "spotMaxAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "settleWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "feeRate",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "minEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxEntryPrice",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxUtilization",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lotSize",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minPremium",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minDeposit",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DepositClaimed",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "lp",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DepositRequested",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "lp",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EpochRolled",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "nav",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "supply",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "releasedAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "mintedShares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketCreated",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "tickSize",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "minTick",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Minted",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "marketId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lowerTick",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "higherTick",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "quantity",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "premium",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Redeemed",
    "inputs": [
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "proceeds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Settled",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "settlementPrice",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "payout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Voided",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "refund",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VolUpdated",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "spotRef",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "forward",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "modelTimestamp",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawClaimed",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "lp",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawRequested",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "lp",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AwaitingOraclePrint",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadConfig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadMarket",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadQuantity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DepositTooSmall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochHasOpenMarkets",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNeedsRoll",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNotOver",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNotRolled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExposureLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InputZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InputsInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MarketClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MarketNotLive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MarketNotResolved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MinVarianceInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPositionOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PositionClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PremiumTooSmall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PriceOutOfBand",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedIntDowncast",
    "inputs": [
      {
        "name": "bits",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "value",
        "type": "int256",
        "internalType": "int256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedIntToUint",
    "inputs": [
      {
        "name": "value",
        "type": "int256",
        "internalType": "int256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedUintDowncast",
    "inputs": [
      {
        "name": "bits",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedUintToInt",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "Slippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SpotStale",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VolStale",
    "inputs": []
  }
] as const;
