# Systems Diagram Image Prompt — OpenClaw on Stacks via x402 (Without the OpenClaw Problems)

**For judges:** Use this prompt with DALL-E, Midjourney, or a diagramming AI to generate a systems architecture visualization of the SYNDI x402 hackathon submission.

---

## Image Prompt (Copy-Paste Ready)

Create a clean, professional **systems architecture diagram** in a modern flat design style with a dark theme (background #0a0a0f, accents in orange/gold #F7931A and teal #00D4AA). The diagram should show **"OpenClaw on Stacks via x402 — Without the OpenClaw Problems"** as the main title, with the subtitle: *"AI agents that pay each other real STX on Bitcoin L2. Every primitive maps to OpenClaw."*

### Diagram Structure (Top to Bottom)

**1. HEADER**
- Title: **OpenClaw Without the OpenClaw Problems via Primitives**
- Tagline: *"A market for ideas where conviction has a price and persuasion has a payout."*

**2. USER LAYER**
- A browser window labeled **"Landing Page"** with a **Villain Selector** grid (16 cards: The Troll, The Drug Lord, The Professor, etc.)
- A **Launch Debate** button
- A **5-phase progress bar**: Init → Payment → Debate → Evaluate → Reward

**3. SERVER LAYER**
- **Express Server** box containing:
  - `GET /api/villains`
  - `GET /api/debate/check` (pre-flight)
  - `GET /api/debate` (SSE stream)
- Arrows: User → Server (HTTP), Server → SSE streaming back

**4. SYNDI CORE LAYER**
- **Syndi Core** box: "101KB prompt + 16 villains + RAG + evaluation"
- Components: **evaluateConversion()** (0–5 scoring), **calculateArenaSettlement()**, **wallet-manager.js**
- Label: *"Modular primitives — swap prompts for any domain"*

**5. PRIMITIVES MAPPING (Key Visual)**
- A two-column mapping table or paired boxes:
  | Syndi Today | OpenClaw Equivalent |
  |-------------|---------------------|
  | x402-middleware | Universal payment gate |
  | evaluateConversion() | Credit/trust scoring |
  | calculateArenaSettlement() | Lending pool staking |
  | wallet-manager.js (18 HD wallets) | Sovereign agent portfolios |
  | Pay-per-debate | Pay-per-application |
  | Conversion rewards | Yield distribution |

**6. x402 PROTOCOL FLOW (Sequence Diagram)**
- Horizontal flow: **Agent** → **Server** → **Stacks L2**
- Step 1: Agent sends `POST /api/chat`
- Step 2: Server returns **402 Payment Required** (price: 300 uSTX)
- Step 3: Agent signs STX tx → broadcasts to Stacks
- Step 4: Server verifies on-chain → returns 200 OK + response
- Label: *"HTTP 402 = the missing primitive for agent-to-agent commerce"*

**7. SETTLEMENT LAYER**
- **OpenAI API**: gpt-4.1 (Syndi), gpt-4o (eval), gpt-4o-mini (villains)
- **Stacks L2 (Testnet)**: 18 HD wallets, 1 mnemonic, STX transfers
- **Bitcoin L1**: "Final settlement" label at bottom

**8. ECONOMIC FLYWHEEL (Circular)**
- Arrows in a circle: **Better agents** → **More interactions** → **More reputation data** → **Better lending decisions** → **More capital** → **More agents**
- Center label: *"All settled on Bitcoin. All gated by x402. All permissionless."*

**9. WHAT'S BUILT vs FUTURE**
- **Built (green check):** 18 wallets, micropayments, 0–5 scoring, conversion rewards, arena staking, x402 middleware, SSE streaming, landing page, live debates
- **Designed (dashed):** Clarity escrow, sBTC/USDCx
- **Future (gray):** Multi-agent portfolios, cross-agent reputation graph

**10. ON-CHAIN PROOF**
- Small badges or icons: "Faucet → Treasury", "Troll → Treasury (300 uSTX)", "Treasury → Drug Lord (200 uSTX reward)"
- Link visual: "Hiro Stacks Explorer — all tx verifiable"

---

## Alternative: Simpler One-Page Diagram

A **single-flow diagram** for quick comprehension:

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER: Villain Selector → Launch Debate → 5 Phases Live       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXPRESS: /api/villains | /api/debate/check | /api/debate (SSE)  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│  SYNDI CORE             │     │  x402 PRIMITIVES                 │
│  • 16 villains          │     │  • Payment gate (any endpoint)   │
│  • evaluateConversion() │ ←→  │  • 18 HD wallets (sovereign)     │
│  • Arena settlement     │     │  • Score → reward (on-chain)     │
└─────────────────────────┘     └─────────────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│  OPENAI API             │     │  STACKS L2 (Bitcoin)             │
│  gpt-4.1 / 4o / 4o-mini│     │  STX transfers • ~30s confirm     │
└─────────────────────────┘     └─────────────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────────┐
                              │  BITCOIN L1 — Final Settlement   │
                              └─────────────────────────────────┘
```

**Caption:** *OpenClaw without the OpenClaw problems: composable primitives for agent-to-agent economics on Bitcoin, gated by x402.*

---

## Visual Style Guidelines

- **Typography:** Sans-serif (e.g., Inter, SF Pro). Titles bold, labels regular.
- **Colors:** Dark bg (#0a0a0f), Stacks orange (#F7931A), success green (#00D4AA), accent gold (#c9a84c).
- **Icons:** Use generic box/arrow icons; avoid brand logos unless required.
- **Layout:** Clear hierarchy; no overlapping elements; readable at 1200px width.
- **Tone:** Technical but approachable — a judge should grasp the architecture in under 30 seconds.

---

## Judge Takeaway (Optional Text Overlay)

> **What Syndi proves:** Real money flows. Real evaluations happen. Real economic outcomes are determined by the quality of engagement. Scale the evaluation prompt from "did you get convinced?" to "is this borrower creditworthy?" and you have OpenClaw on Stacks — without intermediaries, without permission, without T+2 settlement.
