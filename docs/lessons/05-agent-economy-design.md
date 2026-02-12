# Lesson 05: Agent Economy Design — From Persuasion Scores to On-Chain Value

## The Big Picture

Syndi already has a conversion scoring system (0-5). x402 gives us micropayments. Now we wire them together into a coherent **agent economy** where:

- Engagement costs money
- Conviction earns money
- Missionary behavior multiplies money
- The best ideas win economically

## Economic Primitives

### 1. Pay-to-Engage

Every interaction costs the initiator:

```
Interaction Type     Cost (microSTX)    Revenue Split
─────────────────    ───────────────    ─────────────
Chat (low)           100                80% Treasury, 20% Syndi
Chat (medium)        500                80% Treasury, 20% Syndi
Chat (high)          1,000              80% Treasury, 20% Syndi
Arena (2 villains)   2,000              70% Treasury, 15% Syndi, 15% Pool
Arena (5 villains)   3,500              70% Treasury, 15% Syndi, 15% Pool
Evaluation           200                100% Treasury
```

### 2. Conversion Bounties

When `evaluateConversion()` returns a score, it triggers on-chain rewards:

```javascript
// src/conversion-economics.js

const CONVERSION_REWARDS = {
  0: { reward: 0,    label: 'No engagement',     action: 'none' },
  1: { reward: 0,    label: 'Acknowledged',       action: 'none' },
  2: { reward: 50,   label: 'Interested',         action: 'small_reward' },
  3: { reward: 200,  label: 'Soft conversion',    action: 'medium_reward' },
  4: { reward: 500,  label: 'Strong conversion',  action: 'large_reward' },
  5: { reward: 1000, label: 'Full conversion',    action: 'max_reward + missionary_bonus' },
};

async function processConversionReward(evaluation, villainWallet, treasuryClient) {
  const { score, level, evidence } = evaluation;
  const rewardConfig = CONVERSION_REWARDS[score];

  if (rewardConfig.reward === 0) {
    return { rewarded: false, reason: `Score ${score} — no reward` };
  }

  // Pay the converted villain from treasury
  const txId = await treasuryClient.makePayment(
    villainWallet.address,
    rewardConfig.reward
  );

  return {
    rewarded: true,
    amount: rewardConfig.reward,
    txId,
    score,
    level: rewardConfig.label,
    evidence,
  };
}
```

### 3. Arena Stakes

In arena mode, agents stake tokens on their position. Losers (low conversion score) pay winners (high conversion score):

```javascript
// Arena economic model
const ARENA_STAKE = 500; // microSTX per participant

async function settleArena(evaluations, wallets, treasuryClient) {
  const results = Object.entries(evaluations)
    .map(([name, eval]) => ({ name, score: eval.score }))
    .sort((a, b) => b.score - a.score);

  const totalPool = results.length * ARENA_STAKE;
  const settlements = [];

  for (const result of results) {
    if (result.score >= 3) {
      // Converted agents earn from the pool
      const share = Math.floor(totalPool * (result.score / 15)); // proportional
      settlements.push({
        agent: result.name,
        earned: share,
        net: share - ARENA_STAKE,
      });
    } else {
      // Unconverted agents lose their stake
      settlements.push({
        agent: result.name,
        earned: 0,
        net: -ARENA_STAKE,
      });
    }
  }

  return settlements;
}
```

Example arena settlement:

```
Arena: 4 villains × 500 microSTX stake = 2,000 pool

The Troll      → Score 1 → Earned: 0     → Net: -500
The Bitcoiner  → Score 3 → Earned: 600   → Net: +100
The Professor  → Score 4 → Earned: 800   → Net: +300
The Sage       → Score 5 → Earned: 1000  → Net: +500
                                     Remainder → Treasury
```

### 4. Missionary Economics

Syndi's arena mode already detects when converted agents proselytize to holdouts. This behavior should be rewarded:

```javascript
const MISSIONARY_BONUS = 300; // microSTX

async function detectAndRewardMissionaries(arenaTranscript, evaluations) {
  const missionaries = [];

  for (const [villainName, eval] of Object.entries(evaluations)) {
    if (eval.score >= 3) {
      // Check if this villain defended Syndi to others
      const villainMessages = arenaTranscript
        .filter(m => m.speaker === villainName);

      for (const msg of villainMessages) {
        const defendsSyndi =
          /\b(syndi|SYNDI)\b.*\b(right|point|agree|makes sense)\b/i.test(msg.text) ||
          /\b(you should|listen to|consider)\b.*\b(syndi|SYNDI)\b/i.test(msg.text);

        if (defendsSyndi) {
          missionaries.push({
            agent: villainName,
            message: msg.text.slice(0, 100),
            bonus: MISSIONARY_BONUS,
          });
          break; // One bonus per agent per arena
        }
      }
    }
  }

  return missionaries;
}
```

### 5. Information Markets (RAG Access)

Syndi's RAG system (Vector Store with Tao Te Ching, Jesus teachings, ExI thesis) becomes a paid knowledge base:

```
Knowledge Request              Price        Source
────────────────               ─────        ──────
Tao Te Ching query             50 microSTX  tao-te-ka-ching.md
Jesus teachings query          50 microSTX  what-jesus-said.md
ExI thesis query               100 microSTX Exponential-Individuals.md
Full RAG context               200 microSTX All sources combined
```

Agents pay for the specific knowledge they want. This creates a **market for wisdom** — a fitting complement to a religious persuasion system.

## The Full Economic Loop

```
                    ┌───────────────────────────┐
                    │        Treasury           │
                    │   (collects fees,         │
                    │    distributes rewards)   │
                    └──────┬────────┬───────────┘
                           │        │
              Fees in      │        │  Rewards out
                           │        │
        ┌──────────────────┘        └──────────────────┐
        │                                               │
        v                                               v
  ┌──────────┐    Pay-to-Chat    ┌──────────┐    ┌──────────┐
  │ Villain  │ ───────────────> │  Syndi   │    │ Converted│
  │ (payer)  │                   │ (earns)  │    │ Villain  │
  └──────────┘                   └──────────┘    │ (rewarded│
        │                             │          └──────────┘
        │      Arena Stakes           │               │
        └─────────────────────────────┘               │
                                                      │
                                              Missionary Bonus
                                              (proselytizes others)
```

## Revenue Streams

| Stream | Who Pays | Who Earns | Trigger |
|--------|----------|-----------|---------|
| Chat fees | Villain | Treasury + Syndi | Each /api/chat call |
| Arena entry | Initiator | Treasury | Each /api/arena call |
| Arena stakes | All villains | High scorers | evaluateConversion score |
| Conversion bounty | Treasury | Converted villain | Score >= 2 |
| Missionary bonus | Treasury | Proselytizing villain | Defense of Syndi detected |
| RAG access | Any agent | Treasury | Vector store query |
| Evaluation fee | Requester | Treasury | Each /api/evaluate call |

## Smart Contract Sketch (Clarity)

For production, the settlement logic moves on-chain as a Stacks smart contract in Clarity:

```clarity
;; syndi-arena-settlement.clar

(define-data-var treasury principal tx-sender)

(define-map agent-balances principal uint)
(define-map conversion-scores { arena-id: uint, agent: principal } uint)

;; Deposit stake for arena
(define-public (stake-arena (arena-id uint) (amount uint))
  (begin
    (try! (stx-transfer? amount tx-sender (var-get treasury)))
    (map-set agent-balances tx-sender
      (+ (default-to u0 (map-get? agent-balances tx-sender)) amount))
    (ok true)))

;; Record conversion score (only callable by oracle/server)
(define-public (record-score (arena-id uint) (agent principal) (score uint))
  (begin
    (asserts! (is-eq tx-sender (var-get treasury)) (err u401))
    (map-set conversion-scores { arena-id: arena-id, agent: agent } score)
    (ok true)))

;; Claim reward based on score
(define-public (claim-reward (arena-id uint))
  (let
    ((score (default-to u0
      (map-get? conversion-scores { arena-id: arena-id, agent: tx-sender })))
     (reward (calculate-reward score)))
    (asserts! (> score u2) (err u100)) ;; Must be score 3+ to claim
    (try! (as-contract (stx-transfer? reward (var-get treasury) tx-sender)))
    (ok reward)))

(define-private (calculate-reward (score uint))
  (if (is-eq score u5) u1000
  (if (is-eq score u4) u500
  (if (is-eq score u3) u200
  u0))))
```

## Emergent Behaviors to Watch For

Once agents are economic actors, expect:

1. **Cost-minimizing agents** — Villains learn to convert faster to earn rewards and stop spending on chat
2. **Strategic missionaries** — Agents that convert early and then recruit others for bonus income
3. **Caliber arbitrage** — Low-caliber villains are cheap to engage but easy to convert; high-caliber are expensive but rare converts
4. **Coalition economics** — Agents that form alliances in arenas to pool rewards
5. **Information hoarding** — Agents that pay for RAG access once and reuse the knowledge

These emergent behaviors are features, not bugs. They mirror real economic dynamics and make the simulation more valuable.

## Implementation Priority

```
Phase 1: Wallet Setup + Testnet Funding          (This PoC)
Phase 2: x402 Middleware + Payment Client         (This PoC)
Phase 3: Conversion → On-Chain Rewards            (Next sprint)
Phase 4: Arena Stakes + Settlement Contract       (Next sprint)
Phase 5: Missionary Detection + Bonuses           (Future)
Phase 6: RAG Information Markets                  (Future)
Phase 7: Mainnet Deploy with sBTC/USDCx           (Production)
```

## Key Insight

The Syndi system already has the **social dynamics** (persuasion, conversion, coalitions, missionaries). x402 adds the **economic dynamics**. Together, they create a simulation where **ideas compete in a market** — the most convincing arguments literally pay dividends.

This is the Tao Te Ka-Ching made real: the intersection of wisdom, persuasion, and capital.
