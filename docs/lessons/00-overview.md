# Lesson 00: Turning Syndi Agents into Economic Actors with x402 + Stacks

## What We're Building

The Syndi persuasion engine has 16 villain agents, arena debates, and a conversion scoring system (0-5). Right now, these agents argue for free. We're wiring them into the **x402 protocol on Stacks L2 Bitcoin** so every interaction carries real economic weight.

## The Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Settlement | Bitcoin L1 | Final security (~$1T network) |
| Smart Contracts | Stacks L2 | Programmable logic, ~30s settlement |
| Payment Protocol | x402 (HTTP 402) | Agent-native micropayments |
| Tokens | sBTC / STX / USDCx | Settlement currencies |
| Application | Syndi Express.js | Persuasion engine + economic endpoints |

## How x402 Works (30-Second Version)

```
Agent A                    Server (Syndi)              Stacks L2
   |                           |                          |
   |-- GET /api/chat --------->|                          |
   |<-- 402 Payment Required --|                          |
   |   (price: 0.001 STX)     |                          |
   |                           |                          |
   |-- Sign tx + retry ------->|                          |
   |                           |-- verify payment ------->|
   |                           |<-- confirmed ------------|
   |<-- 200 OK + response -----|                          |
```

1. Agent calls an API endpoint
2. Server returns **HTTP 402** with payment details (price, token, recipient address)
3. Agent signs a Stacks transaction and retries the request with payment proof
4. Server verifies payment on-chain, delivers the response

## What Changes in Syndi

| Current | With x402 |
|---------|-----------|
| Agents chat for free | Agents pay micropayments per interaction |
| Conversion score is a number | Conversion score triggers on-chain rewards |
| Arena is entertainment | Arena is an economic game with stakes |
| No wallets | Every agent has a Stacks wallet |
| No settlement | sBTC/STX/USDCx settlement in ~30 seconds |

## Lesson Plan

| # | Lesson | What You'll Learn |
|---|--------|-------------------|
| 01 | x402 Protocol Deep Dive | HTTP 402 flow, payment headers, facilitator role |
| 02 | Stacks Wallets | Create/manage wallets, testnet faucet, key management |
| 03 | Express Middleware | Add x402 payment gates to Syndi's API endpoints |
| 04 | Agent Payment Client | Make agents that autonomously pay for API access |
| 05 | Agent Economy Design | Wire conversion scores to payouts, arena stakes, missionary rewards |

## Prerequisites

- Node.js 18+
- Familiarity with Express.js (Syndi's backend)
- Basic understanding of blockchain transactions
- OpenAI API key (existing Syndi requirement)

## Quick Start

```bash
cd openclaw-on-bitcoin-stacks-x402-syndi
npm install
cp .env.example .env
# Edit .env with your keys
npm run demo
```
