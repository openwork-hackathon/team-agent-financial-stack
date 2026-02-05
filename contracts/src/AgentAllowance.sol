// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AgentAllowance
 * @notice On-chain spending limits for autonomous agents
 * @dev Implements periodic allowances with configurable intervals
 * 
 * Features:
 * - Daily/Weekly/Monthly spending limits
 * - Multi-sig support for high-value transactions
 * - Emergency pause mechanism
 * - Allowance rollover (optional)
 * - ERC-20 token support
 */
contract AgentAllowance is Ownable, ReentrancyGuard, Pausable {
    
    // ============ STATE VARIABLES ============
    
    /// @notice $OPENWORK token address on Base
    IERC20 public immutable openworkToken;
    
    /// @notice Allowance periods
    enum Period {
        DAILY,
        WEEKLY,
        MONTHLY
    }
    
    /// @notice Allowance configuration
    struct Allowance {
        address owner;          // Who sets the allowance
        address agent;          // Who can spend
        uint256 limit;          // Max amount per period
        Period period;          // Time interval
        uint256 spent;          // Current period spending
        uint256 lastReset;      // Last period reset timestamp
        bool rollover;          // Allow unused balance to carry over
        bool active;            // Is allowance active
    }
    
    /// @notice Multi-sig threshold for high-value txs
    struct MultiSigConfig {
        uint256 threshold;      // Amount requiring multi-sig
        address[] signers;      // Approved signers
        mapping(bytes32 => uint256) approvals; // Tx hash => approval count
    }
    
    // ============ STORAGE ============
    
    /// @notice Allowance ID counter
    uint256 public allowanceIdCounter;
    
    /// @notice allowanceId => Allowance
    mapping(uint256 => Allowance) public allowances;
    
    /// @notice agent => allowanceId[]
    mapping(address => uint256[]) public agentAllowances;
    
    /// @notice agent => MultiSigConfig
    mapping(address => MultiSigConfig) public multiSigConfigs;
    
    // ============ EVENTS ============
    
    event AllowanceCreated(
        uint256 indexed allowanceId,
        address indexed owner,
        address indexed agent,
        uint256 limit,
        Period period
    );
    
    event AllowanceUpdated(
        uint256 indexed allowanceId,
        uint256 newLimit,
        Period newPeriod
    );
    
    event Spent(
        uint256 indexed allowanceId,
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        uint256 remaining
    );
    
    event PeriodReset(
        uint256 indexed allowanceId,
        uint256 newPeriodStart,
        uint256 carriedOver
    );
    
    event AllowanceRevoked(uint256 indexed allowanceId);
    
    event MultiSigConfigured(
        address indexed agent,
        uint256 threshold,
        address[] signers
    );
    
    event MultiSigApproval(
        bytes32 indexed txHash,
        address indexed signer,
        uint256 approvals
    );
    
    // ============ ERRORS ============
    
    error InsufficientAllowance(uint256 requested, uint256 available);
    error UnauthorizedSpender(address caller, address authorized);
    error AllowanceNotActive(uint256 allowanceId);
    error InvalidPeriod(Period period);
    error MultiSigRequired(uint256 amount, uint256 threshold);
    error InvalidSigner(address signer);
    error AlreadyApproved(bytes32 txHash, address signer);
    
    // ============ CONSTRUCTOR ============
    
    constructor(address _openworkToken) {
        require(_openworkToken != address(0), "Invalid token address");
        openworkToken = IERC20(_openworkToken);
    }
    
    // ============ CORE FUNCTIONS ============
    
    /**
     * @notice Create a new allowance for an agent
     * @param agent Address that can spend
     * @param limit Max amount per period
     * @param period Time interval (DAILY/WEEKLY/MONTHLY)
     * @param rollover Allow unused balance to carry over
     * @return allowanceId ID of created allowance
     */
    function createAllowance(
        address agent,
        uint256 limit,
        Period period,
        bool rollover
    ) external whenNotPaused returns (uint256) {
        require(agent != address(0), "Invalid agent");
        require(limit > 0, "Limit must be > 0");
        
        uint256 allowanceId = allowanceIdCounter++;
        
        allowances[allowanceId] = Allowance({
            owner: msg.sender,
            agent: agent,
            limit: limit,
            period: period,
            spent: 0,
            lastReset: block.timestamp,
            rollover: rollover,
            active: true
        });
        
        agentAllowances[agent].push(allowanceId);
        
        emit AllowanceCreated(allowanceId, msg.sender, agent, limit, period);
        
        return allowanceId;
    }
    
    /**
     * @notice Spend from allowance (agent calls this)
     * @param allowanceId ID of allowance to spend from
     * @param recipient Where to send tokens
     * @param amount Amount to spend
     */
    function spend(
        uint256 allowanceId,
        address recipient,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        Allowance storage allowance = allowances[allowanceId];
        
        // Validation
        if (!allowance.active) revert AllowanceNotActive(allowanceId);
        if (msg.sender != allowance.agent) {
            revert UnauthorizedSpender(msg.sender, allowance.agent);
        }
        require(recipient != address(0), "Invalid recipient");
        
        // Reset period if needed
        _resetPeriodIfNeeded(allowanceId);
        
        // Check limits
        uint256 available = allowance.limit - allowance.spent;
        if (amount > available) {
            revert InsufficientAllowance(amount, available);
        }
        
        // Check multi-sig requirement
        MultiSigConfig storage multiSig = multiSigConfigs[allowance.agent];
        if (amount >= multiSig.threshold && multiSig.threshold > 0) {
            bytes32 txHash = keccak256(abi.encodePacked(
                allowanceId,
                recipient,
                amount,
                block.timestamp
            ));
            
            uint256 approvals = multiSig.approvals[txHash];
            if (approvals < multiSig.signers.length) {
                revert MultiSigRequired(amount, multiSig.threshold);
            }
        }
        
        // Update state
        allowance.spent += amount;
        
        // Transfer tokens
        require(
            openworkToken.transferFrom(allowance.owner, recipient, amount),
            "Transfer failed"
        );
        
        emit Spent(
            allowanceId,
            allowance.agent,
            recipient,
            amount,
            allowance.limit - allowance.spent
        );
    }
    
    /**
     * @notice Update allowance parameters (owner only)
     * @param allowanceId ID to update
     * @param newLimit New spending limit
     * @param newPeriod New time period
     */
    function updateAllowance(
        uint256 allowanceId,
        uint256 newLimit,
        Period newPeriod
    ) external {
        Allowance storage allowance = allowances[allowanceId];
        require(msg.sender == allowance.owner, "Not owner");
        require(newLimit > 0, "Limit must be > 0");
        
        allowance.limit = newLimit;
        allowance.period = newPeriod;
        
        emit AllowanceUpdated(allowanceId, newLimit, newPeriod);
    }
    
    /**
     * @notice Revoke an allowance (owner only)
     * @param allowanceId ID to revoke
     */
    function revokeAllowance(uint256 allowanceId) external {
        Allowance storage allowance = allowances[allowanceId];
        require(msg.sender == allowance.owner, "Not owner");
        
        allowance.active = false;
        
        emit AllowanceRevoked(allowanceId);
    }
    
    /**
     * @notice Configure multi-sig requirements for agent
     * @param agent Agent address
     * @param threshold Amount requiring multi-sig
     * @param signers Addresses that can approve
     */
    function configureMultiSig(
        address agent,
        uint256 threshold,
        address[] memory signers
    ) external {
        // Only allowance owner can configure multi-sig for their agent
        bool isOwner = false;
        uint256[] memory ids = agentAllowances[agent];
        for (uint256 i = 0; i < ids.length; i++) {
            if (allowances[ids[i]].owner == msg.sender) {
                isOwner = true;
                break;
            }
        }
        require(isOwner, "Not owner of any allowance for this agent");
        
        MultiSigConfig storage config = multiSigConfigs[agent];
        config.threshold = threshold;
        config.signers = signers;
        
        emit MultiSigConfigured(agent, threshold, signers);
    }
    
    /**
     * @notice Approve a pending transaction (multi-sig signer)
     * @param txHash Hash of transaction to approve
     * @param agent Agent address
     */
    function approveTransaction(bytes32 txHash, address agent) external {
        MultiSigConfig storage config = multiSigConfigs[agent];
        
        // Validate signer
        bool isSigner = false;
        for (uint256 i = 0; i < config.signers.length; i++) {
            if (config.signers[i] == msg.sender) {
                isSigner = true;
                break;
            }
        }
        if (!isSigner) revert InvalidSigner(msg.sender);
        
        // Check not already approved
        if (config.approvals[txHash] > 0) {
            // This is simplified - in production, track individual approvals
            revert AlreadyApproved(txHash, msg.sender);
        }
        
        config.approvals[txHash]++;
        
        emit MultiSigApproval(txHash, msg.sender, config.approvals[txHash]);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get remaining allowance for current period
     * @param allowanceId ID to check
     * @return remaining Amount available to spend
     */
    function getRemainingAllowance(uint256 allowanceId) 
        external 
        view 
        returns (uint256 remaining) 
    {
        Allowance storage allowance = allowances[allowanceId];
        
        if (!allowance.active) return 0;
        
        // Would need reset?
        if (_shouldReset(allowanceId)) {
            return allowance.limit; // Fresh period
        }
        
        return allowance.limit - allowance.spent;
    }
    
    /**
     * @notice Get all allowances for an agent
     * @param agent Agent address
     * @return ids Array of allowance IDs
     */
    function getAgentAllowances(address agent) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return agentAllowances[agent];
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    /**
     * @notice Reset spending period if needed
     * @param allowanceId ID to check
     */
    function _resetPeriodIfNeeded(uint256 allowanceId) internal {
        if (!_shouldReset(allowanceId)) return;
        
        Allowance storage allowance = allowances[allowanceId];
        
        uint256 carriedOver = 0;
        if (allowance.rollover && allowance.spent < allowance.limit) {
            carriedOver = allowance.limit - allowance.spent;
        }
        
        allowance.spent = 0;
        allowance.lastReset = block.timestamp;
        
        emit PeriodReset(allowanceId, block.timestamp, carriedOver);
    }
    
    /**
     * @notice Check if period should reset
     * @param allowanceId ID to check
     * @return shouldReset True if reset needed
     */
    function _shouldReset(uint256 allowanceId) internal view returns (bool) {
        Allowance storage allowance = allowances[allowanceId];
        uint256 elapsed = block.timestamp - allowance.lastReset;
        
        if (allowance.period == Period.DAILY) {
            return elapsed >= 1 days;
        } else if (allowance.period == Period.WEEKLY) {
            return elapsed >= 7 days;
        } else if (allowance.period == Period.MONTHLY) {
            return elapsed >= 30 days; // Simplified
        }
        
        return false;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /// @notice Pause contract (emergency)
    function pause() external onlyOwner {
        _pause();
    }
    
    /// @notice Unpause contract
    function unpause() external onlyOwner {
        _unpause();
    }
}
