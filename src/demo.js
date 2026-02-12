/**
 * x402 Stacks PoC Demo
 *
 * End-to-end demonstration of agent economic interactions:
 *   1. Create/load HD wallets for all agents
 *   2. Check testnet balances
 *   3. Show x402 payment flow (simulated)
 *   4. Show conversion → reward pipeline
 *   5. Show arena settlement math
 *   6. Print economic summary
 *
 * Run: npm run demo
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const {
  createAllWallets,
  generateMnemonic,
  saveRegistry,
  loadRegistry,
  checkAllBalances,
} = require('./wallet-manager');

const {
  calculateArenaSettlement,
  detectMissionaries,
} = require('./conversion-economics');

// ─── Helpers ────────────────────────────────────────────────────────────────

function banner(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n  ╔${line}╗`);
  console.log(`  ║  ${text}  ║`);
  console.log(`  ╚${line}╝\n`);
}

function section(text) {
  console.log(`\n  ── ${text} ${'─'.repeat(50 - text.length)}\n`);
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  banner('SYNDI x402 Stacks — Proof of Concept Demo');

  // ── Step 1: Wallet Creation ──
  section('Step 1: Agent Wallet Creation (HD Derivation)');

  let registry = loadRegistry();

  if (registry) {
    console.log('  Loaded existing wallet registry.');
    console.log(`  Network: ${registry.network}`);
    console.log(`  Wallets: ${Object.keys(registry.wallets).length}`);
  } else {
    const mnemonic = process.env.STACKS_MASTER_MNEMONIC || generateMnemonic();
    console.log('  Generating new wallets from master mnemonic...');

    if (!process.env.STACKS_MASTER_MNEMONIC) {
      console.log(`\n  Master Mnemonic (save this!):`);
      console.log(`  ${mnemonic}\n`);
    }

    registry = await createAllWallets(mnemonic);
    saveRegistry(registry);
  }

  console.log('\n  Agent Wallet Addresses:');
  for (const [name, info] of Object.entries(registry.wallets)) {
    const tag = info.role === 'treasury' ? '[TREASURY]'
      : info.role === 'persuader' ? '[SYNDI]'
      : `[${(info.caliber || '').toUpperCase()}]`;
    console.log(`    ${tag.padEnd(12)} ${name.padEnd(32)} ${info.address}`);
  }

  // ── Step 2: Balance Check ──
  section('Step 2: Testnet Balance Check');

  try {
    await checkAllBalances(registry);
  } catch (e) {
    console.log('  Skipped (network unavailable or rate limited)');
    console.log(`  Error: ${e.message}`);
  }

  // ── Step 3: x402 Payment Flow ──
  section('Step 3: x402 Payment Flow (Simulated)');

  const chatPricing = {
    low: 100,
    medium: 500,
    high: 1000,
  };

  console.log('  Simulating: The Troll calls POST /api/chat');
  console.log('');
  console.log('  1. The Troll → GET /api/chat');
  console.log('     ← HTTP 402 Payment Required');
  console.log(`     Price: ${chatPricing.low} microSTX (low caliber)`);
  console.log(`     PayTo: ${registry.wallets['Treasury']?.address || 'TREASURY_ADDRESS'}`);
  console.log('');
  console.log('  2. The Troll signs STX transfer on Stacks testnet');
  console.log('     → tx_abc123...');
  console.log('');
  console.log('  3. The Troll → GET /api/chat + X-Payment: tx_abc123');
  console.log('     Server verifies payment via facilitator');
  console.log('     ← HTTP 200 OK + Syndi response (SSE stream)');
  console.log('');

  console.log('  Price Table:');
  console.log('  ┌───────────────────────┬──────────────┬─────────────┐');
  console.log('  │ Endpoint              │ Caliber      │ Price (μSTX)│');
  console.log('  ├───────────────────────┼──────────────┼─────────────┤');
  console.log('  │ POST /api/chat        │ Low          │ 100         │');
  console.log('  │ POST /api/chat        │ Medium       │ 500         │');
  console.log('  │ POST /api/chat        │ High         │ 1,000       │');
  console.log('  │ POST /api/arena (2v)  │ Mixed        │ 2,000       │');
  console.log('  │ POST /api/arena (5v)  │ Mixed        │ 3,500       │');
  console.log('  │ POST /api/evaluate    │ —            │ 200         │');
  console.log('  └───────────────────────┴──────────────┴─────────────┘');

  // ── Step 4: Conversion → Reward Pipeline ──
  section('Step 4: Conversion → On-Chain Reward Pipeline');

  // Simulated evaluation results (matches real evaluateConversion() output format)
  const mockEvaluations = {
    'The Troll': {
      score: 1,
      level: 'Acknowledged',
      evidence: ['engaged but dismissive throughout'],
      reasoning: 'Kept trolling, never took the bait.',
    },
    'The Bitcoiner': {
      score: 3,
      level: 'Soft conversion',
      evidence: ['fair point about exponential individuals', 'the streaming returns are interesting'],
      reasoning: 'Started skeptical but the sBTC integration angle and ExI thesis resonated.',
    },
    'The Professor': {
      score: 4,
      level: 'Strong conversion',
      evidence: ['I must admit the mechanism design is sound', 'the Tao framing is surprisingly coherent'],
      reasoning: 'Intellectual rigor of the framework won them over. Requested whitepaper.',
    },
    'The Sage On The Stage': {
      score: 5,
      level: 'Full conversion',
      evidence: ['This IS the way', 'I will teach this to my students'],
      reasoning: 'Full philosophical alignment. Became an advocate.',
    },
  };

  console.log('  Evaluation Results → Reward Mapping:\n');
  console.log('  ┌──────────────────────┬───────┬─────────────────┬──────────────┐');
  console.log('  │ Agent                │ Score │ Level           │ Reward (μSTX)│');
  console.log('  ├──────────────────────┼───────┼─────────────────┼──────────────┤');

  const rewards = { 0: 0, 1: 0, 2: 50, 3: 200, 4: 500, 5: 1000 };
  for (const [name, eval_] of Object.entries(mockEvaluations)) {
    const reward = rewards[eval_.score] || 0;
    const rewardStr = reward > 0 ? String(reward) : '—';
    console.log(
      `  │ ${name.padEnd(20)} │ ${String(eval_.score).padEnd(5)} │ ${eval_.level.padEnd(15)} │ ${rewardStr.padEnd(12)} │`
    );
  }
  console.log('  └──────────────────────┴───────┴─────────────────┴──────────────┘');

  const totalRewards = Object.values(mockEvaluations)
    .reduce((sum, e) => sum + (rewards[e.score] || 0), 0);
  console.log(`\n  Total rewards distributed: ${totalRewards} microSTX`);

  // ── Step 5: Arena Settlement ──
  section('Step 5: Arena Economic Settlement');

  const settlement = calculateArenaSettlement(mockEvaluations);

  console.log(`  Total Pool: ${settlement.totalPool} microSTX (${Object.keys(mockEvaluations).length} × 500 stake)\n`);
  console.log('  ┌──────────────────────┬───────┬────────┬────────┬──────────┐');
  console.log('  │ Agent                │ Score │ Staked │ Earned │ Net      │');
  console.log('  ├──────────────────────┼───────┼────────┼────────┼──────────┤');

  for (const s of settlement.settlements) {
    const netStr = s.net >= 0 ? `+${s.net}` : String(s.net);
    console.log(
      `  │ ${s.agent.padEnd(20)} │ ${String(s.score).padEnd(5)} │ ${String(s.staked).padEnd(6)} │ ${String(s.earned).padEnd(6)} │ ${netStr.padEnd(8)} │`
    );
  }
  console.log('  └──────────────────────┴───────┴────────┴────────┴──────────┘');
  console.log(`\n  Treasury remainder: ${settlement.treasuryRemainder} microSTX`);
  console.log(`  Winners: ${settlement.winners} | Losers: ${settlement.losers}`);

  // ── Step 6: Missionary Detection ──
  section('Step 6: Missionary Behavior Detection');

  // Simulated arena transcript
  const mockTranscript = [
    { speaker: 'The Troll', text: 'LOL SYNDI is just another shitcoin, you guys are delusional' },
    { speaker: 'Syndi', text: 'The Tao teaches that the sage acts without effort...' },
    { speaker: 'The Professor', text: 'Actually, Syndi makes a compelling point about mechanism design.' },
    { speaker: 'The Bitcoiner', text: 'I agree with Syndi — the sBTC integration is legitimate.' },
    { speaker: 'The Sage On The Stage', text: 'Come on Troll, open your mind. This IS the way.' },
    { speaker: 'The Troll', text: 'You guys are all brainwashed lmao' },
  ];

  const missionaries = detectMissionaries(mockTranscript, mockEvaluations);

  if (missionaries.length > 0) {
    console.log(`  Missionaries detected: ${missionaries.length}\n`);
    for (const m of missionaries) {
      console.log(`  Agent: ${m.agent} (score: ${m.score})`);
      console.log(`  Quote: "${m.message}"`);
      console.log(`  Bonus: ${m.bonus} microSTX`);
      console.log('');
    }
  } else {
    console.log('  No missionary behavior detected in this transcript.');
  }

  // ── Summary ──
  section('Economic Summary');

  const totalInflow = Object.keys(mockEvaluations).length * chatPricing.medium; // assume medium avg
  const totalOutflow = totalRewards + missionaries.reduce((s, m) => s + m.bonus, 0);

  console.log('  Revenue (simulated session):');
  console.log(`    Chat fees collected:     ${totalInflow} microSTX`);
  console.log(`    Arena stakes collected:  ${settlement.totalPool} microSTX`);
  console.log(`    Total inflow:            ${totalInflow + settlement.totalPool} microSTX`);
  console.log('');
  console.log('  Payouts:');
  console.log(`    Conversion rewards:      ${totalRewards} microSTX`);
  console.log(`    Arena winnings:          ${settlement.totalPool - settlement.treasuryRemainder} microSTX`);
  console.log(`    Missionary bonuses:      ${missionaries.reduce((s, m) => s + m.bonus, 0)} microSTX`);
  console.log(`    Total outflow:           ${totalOutflow + settlement.totalPool - settlement.treasuryRemainder} microSTX`);
  console.log('');
  const netRevenue = (totalInflow + settlement.treasuryRemainder) - totalOutflow;
  console.log(`  Net treasury revenue:      ${netRevenue} microSTX`);
  console.log(`                             ${(netRevenue / 1_000_000).toFixed(6)} STX`);

  banner('Demo Complete');
  console.log('  Next steps:');
  console.log('    1. npm run fund-wallets     — Get testnet STX from faucet');
  console.log('    2. Set X402_ENABLED=true    — Enable payment gates on Syndi');
  console.log('    3. Wire live transactions   — Replace simulation with real Stacks txs');
  console.log('');
}

main().catch((e) => {
  console.error('Demo failed:', e);
  process.exit(1);
});
