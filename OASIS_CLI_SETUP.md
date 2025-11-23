# Oasis CLI Setup Guide

**Date**: November 22, 2025  
**Purpose**: Install Oasis CLI and create wallet for ROFL deployment

---

## Installation Options

According to the official Oasis documentation, there are two main ways to install the Oasis CLI:

### Option 1: Homebrew (Recommended by Oasis)

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Oasis CLI
brew install oasisprotocol/oasis-core/oasis-cli
```

**Pros**:
- Official recommendation from Oasis docs
- Easy updates with `brew upgrade oasis-cli`
- Auto-updater: `oasis update`

**Cons**:
- Requires Homebrew (additional dependency)

### Option 2: Direct Binary Download

```bash
# Download latest release (v0.17.0)
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow
curl -L https://github.com/oasisprotocol/cli/releases/download/v0.17.0/oasis_cli_0.17.0_linux_amd64.tar.gz -o oasis_cli.tar.gz

# Extract
tar -xzf oasis_cli.tar.gz

# Move to user binaries
sudo mv oasis /usr/local/bin/

# Verify installation
oasis --version
```

**Pros**:
- No additional dependencies
- Direct control over version

**Cons**:
- Manual updates required

---

## Command to Use

**According to Oasis docs, the correct command is**:

```bash
oasis account create
```

**NOT** `oasis wallet create` (older documentation)

---

## Directory Level

**Answer**: You can run this from **any directory**.

The Oasis CLI stores wallet data in a config directory (typically `~/.config/oasis`), so you don't need to be in your project directory.

**Recommendation**: Stay in your project root for documentation purposes:

```bash
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow
oasis account create
```

---

## What Happens When You Run `oasis account create`

1. **Prompts for a name**: e.g., "x402-deployer"
2. **Prompts for a password**: To encrypt the wallet file
3. **Generates**:
   - Mnemonic phrase (24 words) - **SAVE THIS SECURELY**
   - Private key (encrypted)
   - Public address (oasis1...)
4. **Stores** wallet file in `~/.config/oasis/accounts/`

---

## After Creating Wallet

### 1. View Your Address

```bash
oasis account show
```

Output will include:
```
Name:    x402-deployer
Address: oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4
```

### 2. Fund Your Wallet

Visit: https://faucet.testnet.oasis.io/

Enter your `oasis1...` address and request TEST tokens.

**Initial recommendation**: Request 200 TEST tokens
- 100 TEST for ROFL app registration (stake)
- 100 TEST for ~10 hours of machine rental

### 3. Check Balance

```bash
oasis account balance
```

---

## Security Notes

### ⚠️ CRITICAL: Save Your Mnemonic

When you create the account, you'll see a 24-word mnemonic phrase:

```
abandon ability able about above absent absorb abstract absurd abuse access accident
account accuse achieve acid acoustic acquire across act action actor actress actual
```

**You MUST**:
- ✅ Write it down on paper
- ✅ Store in a secure location (password manager, safe)
- ❌ Never share it with anyone
- ❌ Never commit it to git
- ❌ Never store it in plain text files

**Why**: This mnemonic can recover your wallet if you lose access.

### 🔑 This is Different from TEE Facilitator Keys

**Oasis Account** (what you're creating now):
- Purpose: Deploy and manage ROFL apps
- Type: Oasis Network account (oasis1...)
- Holds: TEST tokens (for infrastructure)

**TEE Facilitator Keys** (generate separately later):
- Purpose: Sign blockchain transactions FROM the TEE
- Type: EVM accounts (0x...)
- Holds: ETH/MATIC on Base/Polygon (for gas)

---

## Recommendation

**For your setup, I recommend Option 1 (Homebrew)** because:

1. It's the official method recommended in Oasis docs
2. Easy updates as ROFL evolves during hackathon
3. Built-in auto-updater (`oasis update`)
4. More likely to work smoothly with ROFL commands

**Fallback**: If Homebrew installation fails or you prefer not to install it, use Option 2 (direct binary).

---

## Next Steps After Installation

1. **Install Oasis CLI** (choose option 1 or 2)
2. **Create account**: `oasis account create`
3. **Save mnemonic**: Write down 24 words securely
4. **Get address**: `oasis account show`
5. **Fund wallet**: Visit faucet with your oasis1... address
6. **Verify balance**: `oasis account balance`

Then you'll be ready to proceed with:
- Generating TEE facilitator wallets (separate EVM keys)
- Deploying OmnibusVault contracts
- Building and deploying ROFL app

---

## Questions to Consider

Before we proceed, consider:

1. **Do you have Homebrew installed?** (`which brew`)
   - If yes → Use Option 1
   - If no → Prefer to install Homebrew or use Option 2?

2. **Testnet vs Mainnet?**
   - For ETHGlobal/hackathon → Testnet (faucet.testnet.oasis.io)
   - For production → Mainnet (real ROSE tokens)

3. **How long do you need TEE running?**
   - 10 hours = 100 TEST
   - 24 hours = 240 TEST
   - Consider requesting more from faucet or Oasis team

---

_Ready to install when you decide on the approach!_

