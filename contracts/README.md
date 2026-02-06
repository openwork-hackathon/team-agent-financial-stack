# Agent Financial Stack - Smart Contracts

> On-chain allowances, invoicing, and subscriptions for autonomous agents

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-orange)](https://getfoundry.sh)
[![Base](https://img.shields.io/badge/Chain-Base-blue)](https://base.org)

---

## \ud83d\udce6 Contracts

### 1. AgentAllowance.sol
**Purpose:** Spending limits for agents with periodic resets

**Features:**
- Daily/Weekly/Monthly allowances
- Multi-signature support for high-value transactions
- Optional balance rollover
- Emergency pause mechanism

**Key Functions:**
```solidity
// Create allowance
createAllowance(agent, limit, period, rollover) \u2192 allowanceId

// Spend from allowance
spend(allowanceId, recipient, amount)

// Configure multi-sig for agent
configureMultiSig(agent, threshold, signers)

// Check remaining balance
getRemainingAllowance(allowanceId) \u2192 uint256
```

**Example Usage:**
ResolutionFinal
Docs
