# Lesson 02: Stacks Wallets — Giving Every Agent an Identity and a Balance

## Why Wallets?

In the Syndi system, agents are currently identified by name strings ("The Troll", "The Professor"). To make them economic actors, each agent needs:

1. **A Stacks address** — their on-chain identity
2. **A private key** — to sign transactions autonomously
3. **A balance** — STX/sBTC/USDCx to spend

## Wallet Architecture

```
┌─────────────────────────────────────────────┐
│  Agent Wallet Registry                       │
├──────────────┬──────────────┬───────────────┤
│ Agent Name   │ STX Address  │ Role          │
├──────────────┼──────────────┼───────────────┤
│ Syndi        │ ST1ABC...    │ Persuader     │
│ The Troll    │ ST2DEF...    │ Villain (Low) │
│ The Professor│ ST3GHI...    │ Villain (High)│
│ ...          │ ...          │ ...           │
│ Treasury     │ ST0TRE...    │ Payouts/Fees  │
└──────────────┴──────────────┴───────────────┘
```

## Dependencies

```bash
npm install @stacks/wallet-sdk @stacks/transactions @stacks/network
```

## Creating Wallets Programmatically

### Generate a New Wallet

```javascript
const {
  generateSecretKey,
  generateWallet,
  getStxAddress,
} = require('@stacks/wallet-sdk');
const { TransactionVersion } = require('@stacks/transactions');

async function createAgentWallet(agentName) {
  // Generate a 24-word mnemonic
  const mnemonic = generateSecretKey(256);

  // Derive wallet from mnemonic
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: '', // No password for agent wallets
  });

  // Get first account's testnet address
  const account = wallet.accounts[0];
  const address = getStxAddress({
    account,
    transactionVersion: TransactionVersion.Testnet,
  });

  return {
    agentName,
    mnemonic,       // STORE SECURELY — never log or expose
    address,        // Public — safe to share
    privateKey: account.stxPrivateKey,
  };
}
```

### Batch-Create Wallets for All Agents

```javascript
const { OPPONENTS } = require('../../syndi-core/syndi-core');

async function createAllAgentWallets() {
  const wallets = {};

  // Syndi's wallet
  wallets['Syndi'] = await createAgentWallet('Syndi');

  // Treasury wallet (collects fees, distributes rewards)
  wallets['Treasury'] = await createAgentWallet('Treasury');

  // Each villain gets a wallet
  for (const opponent of OPPONENTS) {
    wallets[opponent.name] = await createAgentWallet(opponent.name);
  }

  return wallets;
}
```

## Key Management

### For Development (Testnet)

Store keys in `.env`:

```env
# Agent Wallets (TESTNET ONLY — never use these patterns in production)
SYNDI_STACKS_MNEMONIC="word1 word2 word3 ... word24"
SYNDI_STACKS_ADDRESS="ST1ABC..."
SYNDI_STACKS_PRIVATE_KEY="abc123..."

TREASURY_STACKS_ADDRESS="ST0TRE..."
TREASURY_STACKS_PRIVATE_KEY="def456..."

# Villain wallets are derived and cached in wallet-registry.json
```

### For Production

- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Never store mnemonics in environment variables
- Consider HD wallet derivation (one master seed, derived keys per agent)
- Rotate keys periodically

### HD Wallet Strategy (Recommended)

Use one master mnemonic and derive agent wallets by index:

```javascript
async function deriveAgentWallet(masterMnemonic, agentIndex) {
  const wallet = await generateWallet({
    secretKey: masterMnemonic,
    password: '',
  });

  // Each agent gets a unique account by index
  // wallet.accounts[0] = Syndi
  // wallet.accounts[1] = Treasury
  // wallet.accounts[2] = The Troll
  // wallet.accounts[3] = The AI-cels
  // ... etc.

  const account = wallet.accounts[agentIndex];
  const address = getStxAddress({
    account,
    transactionVersion: TransactionVersion.Testnet,
  });

  return { address, privateKey: account.stxPrivateKey };
}
```

This way you only need to secure **one mnemonic** instead of 18.

## Funding Agent Wallets (Testnet)

### Via Stacks Faucet API

```javascript
const https = require('https');

async function fundTestnetWallet(address) {
  const response = await fetch(
    'https://stacks-node-api.testnet.stacks.co/extended/v1/faucets/stx',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: address,
        stacking: false,
      }),
    }
  );

  const result = await response.json();
  console.log(`Funded ${address}: tx ${result.txId}`);
  return result;
}

// Fund all agent wallets
async function fundAllAgents(wallets) {
  for (const [name, wallet] of Object.entries(wallets)) {
    console.log(`Funding ${name} (${wallet.address})...`);
    await fundTestnetWallet(wallet.address);
    // Faucet rate limit: wait between requests
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

### Checking Balances

```javascript
async function getBalance(address) {
  const response = await fetch(
    `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${address}/balances`
  );
  const data = await response.json();
  return {
    stx: parseInt(data.stx.balance) / 1_000_000,  // Convert microSTX to STX
    locked: parseInt(data.stx.locked) / 1_000_000,
  };
}
```

## Wallet Registry File

The PoC generates a `wallet-registry.json` that maps agent names to addresses:

```json
{
  "network": "testnet",
  "generated": "2026-02-11T00:00:00Z",
  "wallets": {
    "Syndi": {
      "address": "ST1ABC...",
      "role": "persuader",
      "caliber": "high"
    },
    "Treasury": {
      "address": "ST0TRE...",
      "role": "treasury",
      "caliber": null
    },
    "The Troll": {
      "address": "ST2DEF...",
      "role": "villain",
      "caliber": "low"
    }
  }
}
```

## Security Checklist

- [ ] Never commit `.env` or `wallet-registry.json` with private keys to git
- [ ] Add `wallet-registry.json` and `.env` to `.gitignore`
- [ ] Use testnet for all development
- [ ] Derive wallets from a single master mnemonic (HD approach)
- [ ] In production, use a secrets manager
- [ ] Set spending limits per agent in smart contracts

## Next Lesson

In [Lesson 03](./03-express-middleware.md), we'll build the Express middleware that gates Syndi's endpoints behind x402 payments.
