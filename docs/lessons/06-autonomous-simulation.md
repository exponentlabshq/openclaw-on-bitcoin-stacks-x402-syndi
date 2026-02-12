# Lesson 06: Running the Autonomous Economic Simulation

## What This Does

The autonomous simulation runs the full economic loop with **real Stacks testnet transactions**:

1. Villain agent pays STX to engage Syndi (real transfer)
2. Syndi debates the villain via OpenAI (real LLM calls)
3. Conversation is evaluated for conversion (0–5 score)
4. If score >= 2, Treasury pays the villain a reward (real transfer)
5. Economic ledger is printed with live Stacks Explorer links

## Prerequisites

```bash
# 1. Install dependencies
cd openclaw-on-bitcoin-stacks-x402-syndi
npm install

# 2. Create wallets (if not done)
npm run create-wallets
# Save the mnemonic to .env as STACKS_MASTER_MNEMONIC

# 3. Fund wallets (takes ~2 min due to faucet rate limits)
node src/fund-wallets.js Treasury "The Troll"

# 4. Verify .env has:
#    OPENAI_API_KEY=sk-...
#    STACKS_MASTER_MNEMONIC=word1 word2 ... word24
#    STACKS_NETWORK=testnet
```

## Running the Simulation

### Dry Run (no real transactions, tests LLM integration)

```bash
node src/autonomous-simulation.js --villain "The Troll" --rounds 3 --dry-run
```

### Live Run (real STX transfers on Stacks testnet)

```bash
node src/autonomous-simulation.js --villain "The Troll" --rounds 3
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--villain "Name"` | random | Force a specific villain |
| `--villains N` | 3 | Number of random villains (ignored if --villain set) |
| `--rounds N` | 3 | Conversation rounds per villain |
| `--dry-run` | off | Skip real transactions |

### Examples

```bash
# Quick test: 1 round, dry run
node src/autonomous-simulation.js --villain "The Troll" --rounds 1 --dry-run

# Full session: 3 villains, 5 rounds each, live transactions
node src/autonomous-simulation.js --villains 3 --rounds 5

# High-caliber challenge
node src/autonomous-simulation.js --villain "The Professor" --rounds 5
```

## What Happens Step by Step

### Step 1: Villain Selection

The simulation picks villains from the 16 available. If `--villain` is set, it uses that one. Otherwise it picks a mix of calibers (low, medium, high) up to `--villains` count.

### Step 2: Balance Check

Queries the Stacks testnet API to verify all participating wallets have sufficient STX:

```
  Treasury                       500.000000 STX
  The Troll                      500.000000 STX
```

### Step 3: Conversation + Payment

For each villain:

1. **Payment**: Villain signs a real STX transfer to Treasury
   - Price = caliber rate × number of rounds
   - Low: 100 µSTX/round, Medium: 500, High: 1000
   - Transaction is broadcast to Stacks testnet

2. **Debate**: Real OpenAI API calls
   - Syndi uses gpt-4.1 with the full system prompt + tactical brief
   - Villain uses their assigned model (gpt-4o-mini / gpt-4o / gpt-4.1)
   - Conversation runs for N rounds

3. **Evaluation**: gpt-4o evaluates the conversation
   - Returns score (0–5), level, evidence quotes, reasoning
   - This is the same `evaluateConversion()` from syndi-core.js

4. **Reward**: If score >= 2, Treasury pays the villain
   - Score 2: 50 µSTX (Interested)
   - Score 3: 200 µSTX (Soft conversion)
   - Score 4: 500 µSTX (Strong conversion)
   - Score 5: 1000 µSTX (Full conversion)

### Step 4: Missionary Detection

Scans transcripts for converted agents defending Syndi to others. Missionaries earn a 300 µSTX bonus. (More relevant in multi-villain runs.)

### Step 5: Economic Ledger

Every transaction is logged with type, participants, amount, and Stacks tx ID:

```
  │ chat payment    │ The Troll       │ Treasury        │ 300 µSTX │ b4b72436ac0e... │
  │ conversion reward │ Treasury       │ The Drug Lord   │ 200 µSTX │ 46c63c5a9a11... │
```

### Step 6: Summary

Net economics for the session:

```
  Net Treasury Revenue:  +300 µSTX

  Conversions:
    The Troll      Score: 0/5  Paid: 300 µSTX  Earned: 0 µSTX  Net: -300 µSTX
```

## Real Transaction Examples

From actual test runs on Stacks testnet:

| Transaction | Type | Amount | Explorer Link |
|-------------|------|--------|---------------|
| The Troll → Treasury | Chat payment | 300 µSTX | [View on Explorer](https://explorer.hiro.so/txid/b4b72436ac0e3e54ec20ff5508213c2d1215d7903eee722c4aa2d66b85529a38?chain=testnet) |
| Treasury → The Drug Lord | Conversion reward | 200 µSTX | [View on Explorer](https://explorer.hiro.so/txid/46c63c5a9a111a2df99e2c7788bc237115901fc5791aafaf64b024888000e579?chain=testnet) |
| Faucet → Treasury | Funding | 500 STX | [View on Explorer](https://explorer.hiro.so/txid/0xf58d0a5e1bccfd9340172db7d94facf4e985434a668b0e6a49626d8fb3283825?chain=testnet) |
| Faucet → The Troll | Funding | 500 STX | [View on Explorer](https://explorer.hiro.so/txid/0x4d3b77b2070601bde724703caa9f856e873de1e705a8dac4afcae413dbce97dd?chain=testnet) |

## Economic Dynamics

### For Villains
- **Cost**: Pay per round based on your caliber tier
- **Reward**: Get paid if Syndi convinces you (score 2+)
- **Strategy**: Getting convinced is profitable. Staying stubborn costs money.

### For Treasury
- **Revenue**: All chat fees + arena stakes
- **Costs**: Conversion rewards + missionary bonuses
- **Net**: Positive when villains resist, negative when they convert heavily

### Emergent Behavior
- Low-caliber villains are **cheap to engage but hard to convert** (trolls gonna troll)
- High-caliber villains are **expensive but generate higher-value conversions**
- The economic incentive subtly encourages agents to engage genuinely

## Troubleshooting

### "NotEnoughFunds" error
The villain wallet has no testnet STX. Fund it:
```bash
node src/fund-wallets.js "The Troll"
```

### "STACKS_MASTER_MNEMONIC not set"
Add your mnemonic to `.env`. Generate one with:
```bash
npm run create-wallets
```

### Balance check fails
The Stacks testnet API may be temporarily unreachable. The simulation will still proceed (balances are informational only).

### Conversion score -1
The OpenAI evaluation call failed. Check your `OPENAI_API_KEY` is valid and has quota.
