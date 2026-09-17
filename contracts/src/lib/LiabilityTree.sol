// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title LiabilityTree
/// @notice Per-market payout liability over settlement buckets, with O(log n) range-add and O(1)
///         worst-case read.
/// @dev Plays the role of DeepBook's `strike_payout_tree` for a bounded strike grid. A market has
///      257 settlement buckets (see `YosukuPredict._bucketRange`): every range digital adds its
///      quantity to the contiguous buckets it pays in. `max()` is the largest payout any single
///      settlement price can trigger; `at(i)` is the exact payout if settlement lands in bucket `i`.
///      Lazy-free segment tree: each node stores the pending add for its whole span and the max of
///      its subtree including that add, so no push-down is ever needed.
library LiabilityTree {
    uint256 internal constant BUCKETS = 257;
    uint256 private constant LAST = BUCKETS - 1;

    struct Node {
        int128 add;
        int128 max;
    }

    struct Tree {
        mapping(uint256 => Node) nodes;
    }

    /// @notice Add `delta` to every bucket in `[l, r]`.
    function rangeAdd(Tree storage t, uint256 l, uint256 r, int256 delta) internal {
        require(l <= r && r <= LAST, "LiabilityTree: range");
        _add(t, 1, 0, LAST, l, r, SafeCast.toInt128(delta));
    }

    /// @notice Largest liability over all buckets.
    function max(Tree storage t) internal view returns (int256) {
        return t.nodes[1].max;
    }

    /// @notice Exact liability of bucket `i`.
    function at(Tree storage t, uint256 i) internal view returns (int256 sum) {
        require(i <= LAST, "LiabilityTree: bucket");
        uint256 node = 1;
        uint256 lo = 0;
        uint256 hi = LAST;
        while (true) {
            sum += t.nodes[node].add;
            if (lo == hi) return sum;
            uint256 mid = (lo + hi) >> 1;
            if (i <= mid) {
                node = node << 1;
                hi = mid;
            } else {
                node = (node << 1) | 1;
                lo = mid + 1;
            }
        }
    }

    function _add(Tree storage t, uint256 node, uint256 lo, uint256 hi, uint256 l, uint256 r, int128 delta)
        private
    {
        if (r < lo || hi < l) return;
        Node storage n = t.nodes[node];
        if (l <= lo && hi <= r) {
            n.add += delta;
            n.max += delta;
            return;
        }
        uint256 mid = (lo + hi) >> 1;
        uint256 left = node << 1;
        _add(t, left, lo, mid, l, r, delta);
        _add(t, left | 1, mid + 1, hi, l, r, delta);
        int128 lm = t.nodes[left].max;
        int128 rm = t.nodes[left | 1].max;
        n.max = (lm > rm ? lm : rm) + n.add;
    }
}
