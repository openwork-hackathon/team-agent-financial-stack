// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title InvoiceSettlement
 * @notice On-chain invoicing and settlement for agent-to-agent transactions
 * @dev Implements ERC-8004-style invoice lifecycle with escrow
 *
 * Features:
 * - Draft → Sent → Paid lifecycle
 * - Escrow-based settlement
 * - Dispute resolution
 * - Revenue sharing (95% worker, 5% validator)
 * - Partial payments support
 */

/// Unmerged text fully consolidated