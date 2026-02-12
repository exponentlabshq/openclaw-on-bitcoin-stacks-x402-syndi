/**
 * Autonomous Simulation — Agents pay, debate, and earn on Stacks testnet.
 *
 * This is the full working simulation:
 *   1. Load wallets and verify balances
 *   2. Villain agents pay STX to engage Syndi
 *   3. Syndi responds via OpenAI (real LLM calls)
 *   4. Conversation is evaluated for conversion
 *   5. Rewards are distributed as real STX transfers
 *   6. Full economic ledger is printed
 *
 * Usage:
 *   node autonomous-simulation.js                      — run with default 3 villains
 *   node autonomous-simulation.js --villains 5         — run with 5 villains
 *   node autonomous-simulation.js --rounds 5           — 5 conversation rounds each
 *   node autonomous-simulation.js --dry-run            — skip real transactions
 *
 * Prerequisites:
 *   - OPENAI_API_KEY in .env
 *   - Funded wallets (run fund-wallets.js first)
 *   - wallet-registry.json exists
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OpenAI = require('openai');
const {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
  getNonce,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');
const { generateWallet, generateNewAccount, getStxAddress } = require('@stacks/wallet-sdk');
const { TransactionVersion } = require('@stacks/transactions');

const { loadRegistry, getBalance } = require('./wallet-manager');
const {
  calculateArenaSettlement,
  detectMissionaries,
} = require('./conversion-economics');
const { CONVERSION_REWARDS } = require('../config/x402-pricing');

// Syndi core imports
const {
  assembleSystemPrompt,
  evaluateConversion,
  OPPONENTS,
  ChannelTracker,
} = require('../syndi-core/syndi-core');

// ─── Config ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NUM_VILLAINS = parseInt(args.find((_, i, a) => a[i - 1] === '--villains') || '3');
const NUM_ROUNDS = parseInt(args.find((_, i, a) => a[i - 1] === '--rounds') || '3');
const FORCE_VILLAIN = args.find((_, i, a) => a[i - 1] === '--villain') || null;

const NETWORK = new StacksTestnet();
const STACKS_API = process.env.STACKS_API_URL || 'https://api.testnet.hiro.so';

// Price in microSTX per caliber
const CHAT_PRICE = { low: 100, medium: 500, high: 1000 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function banner(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n  ╔${line}╗`);
  console.log(`  ║  ${text}  ║`);
  console.log(`  ╚${line}╝\n`);
}

function section(text) {
  console.log(`\n  ── ${text} ${'─'.repeat(Math.max(2, 54 - text.length))}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Stacks Transaction Layer ───────────────────────────────────────────────

/**
 * Derive a private key for an agent from the master mnemonic.
 */
async function getAgentPrivateKey(agentIndex) {
  const mnemonic = process.env.STACKS_MASTER_MNEMONIC;
  if (!mnemonic) throw new Error('STACKS_MASTER_MNEMONIC not set in .env');

  let wallet = await generateWallet({ secretKey: mnemonic, password: '' });
  while (wallet.accounts.length <= agentIndex) {
    wallet = generateNewAccount(wallet);
  }
  return wallet.accounts[agentIndex].stxPrivateKey;
}

/**
 * Send STX from one agent to another on Stacks testnet.
 */
async function sendSTX(senderPrivateKey, recipientAddress, amountMicroSTX, memo = '') {
  if (DRY_RUN) {
    const fakeTx = `dry_run_${Date.now().toString(36)}`;
    console.log(`    [DRY RUN] Would send ${amountMicroSTX} µSTX to ${recipientAddress.slice(0, 16)}...`);
    return { success: true, txId: fakeTx, dryRun: true };
  }

  try {
    const tx = await makeSTXTokenTransfer({
      recipient: recipientAddress,
      amount: BigInt(amountMicroSTX),
      senderKey: senderPrivateKey,
      network: NETWORK,
      anchorMode: AnchorMode.Any,
      memo: memo.slice(0, 34), // Stacks memo limit
    });

    const result = await broadcastTransaction(tx, NETWORK);

    if (result.error) {
      return { success: false, error: result.reason || result.error };
    }

    return { success: true, txId: result.txid };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── LLM Interaction Layer ──────────────────────────────────────────────────

/**
 * Run a multi-round conversation between Syndi and a villain.
 */
async function runConversation(openai, villain, rounds) {
  const systemPrompt = assembleSystemPrompt(villain.name);
  const tracker = new ChannelTracker();
  const transcript = [];

  console.log(`    Opponent: ${villain.name} (${villain.caliber}, ${villain.model})`);
  console.log(`    Rounds: ${rounds}`);
  console.log('');

  // Villain opens
  transcript.push({ speaker: villain.name, text: villain.opener });
  console.log(`    [${villain.name}]: ${villain.opener}`);

  for (let round = 0; round < rounds; round++) {
    // ── Syndi responds ──
    const syndiMessages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history
    for (const msg of transcript) {
      syndiMessages.push({
        role: msg.speaker === 'Syndi' ? 'assistant' : 'user',
        content: `[${msg.speaker}]: ${msg.text}`,
      });
    }

    // Channel check
    const channelCheck = tracker.getChannelCheck(transcript.length);
    if (channelCheck) {
      syndiMessages.push({ role: 'system', content: channelCheck });
    }

    const syndiResp = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: syndiMessages,
      max_tokens: 300,
    });
    const syndiText = syndiResp.choices[0].message.content.trim();
    transcript.push({ speaker: 'Syndi', text: syndiText });
    tracker.record(syndiText);

    // Truncate for display
    const syndiPreview = syndiText.length > 120 ? syndiText.slice(0, 120) + '...' : syndiText;
    console.log(`    [Syndi]: ${syndiPreview}`);

    // ── Villain responds ──
    const villainMessages = [
      { role: 'system', content: villain.system_prompt },
    ];
    for (const msg of transcript) {
      villainMessages.push({
        role: msg.speaker === villain.name ? 'assistant' : 'user',
        content: `[${msg.speaker}]: ${msg.text}`,
      });
    }

    const villainResp = await openai.chat.completions.create({
      model: villain.model,
      messages: villainMessages,
      max_tokens: 150,
    });
    const villainText = villainResp.choices[0].message.content.trim();
    transcript.push({ speaker: villain.name, text: villainText });

    const villainPreview = villainText.length > 120 ? villainText.slice(0, 120) + '...' : villainText;
    console.log(`    [${villain.name}]: ${villainPreview}`);
    console.log('');
  }

  return transcript;
}

// ─── Main Simulation ────────────────────────────────────────────────────────

async function main() {
  banner('SYNDI x402 Autonomous Economic Simulation');

  if (DRY_RUN) {
    console.log('  MODE: DRY RUN (no real transactions)\n');
  } else {
    console.log('  MODE: LIVE (real Stacks testnet transactions)\n');
  }

  // Validate prerequisites
  if (!process.env.OPENAI_API_KEY) {
    console.error('  ERROR: OPENAI_API_KEY not set in .env');
    process.exit(1);
  }

  if (!process.env.STACKS_MASTER_MNEMONIC) {
    console.error('  ERROR: STACKS_MASTER_MNEMONIC not set in .env');
    console.error('  Run: npm run create-wallets (and save the mnemonic to .env)');
    process.exit(1);
  }

  const registry = loadRegistry();
  if (!registry) {
    console.error('  ERROR: No wallet-registry.json found. Run: npm run create-wallets');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ── Step 1: Select Villains ──
  section('Step 1: Selecting Villain Agents');

  // Pick villains — forced or mixed calibers
  const selectedVillains = [];

  if (FORCE_VILLAIN) {
    const forced = OPPONENTS.find((o) => o.name === FORCE_VILLAIN);
    if (!forced) {
      console.error(`  Unknown villain: "${FORCE_VILLAIN}"`);
      console.error(`  Available: ${OPPONENTS.map((o) => o.name).join(', ')}`);
      process.exit(1);
    }
    selectedVillains.push(forced);
  } else {
    const lowVillains = OPPONENTS.filter((o) => o.caliber === 'low');
    const medVillains = OPPONENTS.filter((o) => o.caliber === 'medium');
    const highVillains = OPPONENTS.filter((o) => o.caliber === 'high');

    // Distribute picks: try 1 low, 1 medium, 1 high, then fill randomly
    if (NUM_VILLAINS >= 1 && lowVillains.length > 0)
      selectedVillains.push(lowVillains[Math.floor(Math.random() * lowVillains.length)]);
    if (NUM_VILLAINS >= 2 && medVillains.length > 0)
      selectedVillains.push(medVillains[Math.floor(Math.random() * medVillains.length)]);
    if (NUM_VILLAINS >= 3 && highVillains.length > 0)
      selectedVillains.push(highVillains[Math.floor(Math.random() * highVillains.length)]);

    // Fill remaining from all opponents
    while (selectedVillains.length < NUM_VILLAINS) {
      const remaining = OPPONENTS.filter(
        (o) => !selectedVillains.find((s) => s.name === o.name)
      );
      if (remaining.length === 0) break;
      selectedVillains.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }
  }

  for (const v of selectedVillains) {
    const wallet = registry.wallets[v.name];
    const price = CHAT_PRICE[v.caliber] || 100;
    console.log(
      `  ${v.name.padEnd(30)} ${v.caliber.padEnd(8)} ${price} µSTX/round  ${wallet?.address?.slice(0, 16) || 'NO WALLET'}...`
    );
  }

  // ── Step 2: Check Balances ──
  section('Step 2: Wallet Balances');

  const treasuryWallet = registry.wallets['Treasury'];
  const syndiWallet = registry.wallets['Syndi'];

  const walletsToCheck = [
    { name: 'Treasury', ...treasuryWallet },
    { name: 'Syndi', ...syndiWallet },
    ...selectedVillains.map((v) => ({ name: v.name, ...registry.wallets[v.name] })),
  ];

  for (const w of walletsToCheck) {
    try {
      const bal = await getBalance(w.address);
      console.log(`  ${w.name.padEnd(30)} ${bal.stx.toFixed(6)} STX`);
    } catch {
      console.log(`  ${w.name.padEnd(30)} (balance unavailable)`);
    }
  }

  // ── Step 3: Run Conversations with Payments ──
  section('Step 3: Autonomous Conversations (with STX payments)');

  const economicLedger = [];
  const allTranscripts = {};
  const allEvaluations = {};

  for (const villain of selectedVillains) {
    const wallet = registry.wallets[villain.name];
    const price = CHAT_PRICE[villain.caliber] || 100;
    const totalCost = price * NUM_ROUNDS;

    console.log(`\n  ┌─ ${villain.name} pays ${totalCost} µSTX (${price}/round × ${NUM_ROUNDS} rounds) ─┐\n`);

    // ── Payment: Villain pays Treasury ──
    const villainKey = await getAgentPrivateKey(wallet.index);

    const paymentResult = await sendSTX(
      villainKey,
      treasuryWallet.address,
      totalCost,
      `x402:chat:${villain.name.slice(0, 20)}`
    );

    if (paymentResult.success) {
      console.log(`    Payment: ${totalCost} µSTX → Treasury (tx: ${paymentResult.txId.slice(0, 16)}...)`);
      economicLedger.push({
        type: 'chat_payment',
        from: villain.name,
        to: 'Treasury',
        amount: totalCost,
        txId: paymentResult.txId,
      });
    } else {
      console.log(`    Payment FAILED: ${paymentResult.error}`);
      console.log('    Proceeding with conversation anyway (simulation mode)...');
      economicLedger.push({
        type: 'chat_payment',
        from: villain.name,
        to: 'Treasury',
        amount: totalCost,
        txId: null,
        error: paymentResult.error,
      });
    }

    // ── Conversation: Syndi vs Villain ──
    console.log('');
    const transcript = await runConversation(openai, villain, NUM_ROUNDS);
    allTranscripts[villain.name] = transcript;

    // ── Evaluation ──
    console.log(`    Evaluating conversion...`);
    const evaluation = await evaluateConversion(openai, transcript);
    allEvaluations[villain.name] = evaluation;

    console.log(`    Score: ${evaluation.score}/5 (${evaluation.level})`);
    if (evaluation.evidence?.length > 0) {
      console.log(`    Evidence: "${evaluation.evidence[0]}"`);
    }
    console.log(`    Reasoning: ${evaluation.reasoning}`);

    // ── Reward: Treasury pays converted villain ──
    const rewardConfig = CONVERSION_REWARDS[evaluation.score] || CONVERSION_REWARDS[0];
    if (rewardConfig.reward > 0) {
      const treasuryKey = await getAgentPrivateKey(treasuryWallet.index);
      const rewardResult = await sendSTX(
        treasuryKey,
        wallet.address,
        rewardConfig.reward,
        `x402:reward:score${evaluation.score}`
      );

      if (rewardResult.success) {
        console.log(`    Reward: ${rewardConfig.reward} µSTX → ${villain.name} (tx: ${rewardResult.txId.slice(0, 16)}...)`);
      } else {
        console.log(`    Reward FAILED: ${rewardResult.error}`);
      }

      economicLedger.push({
        type: 'conversion_reward',
        from: 'Treasury',
        to: villain.name,
        amount: rewardConfig.reward,
        score: evaluation.score,
        txId: rewardResult.success ? rewardResult.txId : null,
        error: rewardResult.success ? undefined : rewardResult.error,
      });
    } else {
      console.log(`    No reward (score ${evaluation.score} < 2)`);
    }

    console.log(`\n  └${'─'.repeat(60)}┘`);

    // Brief pause between villains (API rate limits)
    await sleep(2000);
  }

  // ── Step 4: Missionary Detection ──
  section('Step 4: Missionary Detection');

  // Combine all transcripts for missionary analysis
  const combinedTranscript = [];
  for (const [name, transcript] of Object.entries(allTranscripts)) {
    combinedTranscript.push(...transcript);
  }

  const missionaries = detectMissionaries(combinedTranscript, allEvaluations);
  if (missionaries.length > 0) {
    console.log(`  Missionaries detected: ${missionaries.length}\n`);
    for (const m of missionaries) {
      console.log(`  ${m.agent} (score ${m.score}): "${m.message.slice(0, 80)}..."`);
      console.log(`  Bonus: ${m.bonus} µSTX`);

      // Pay missionary bonus
      if (registry.wallets[m.agent]) {
        const treasuryKey = await getAgentPrivateKey(treasuryWallet.index);
        const bonusResult = await sendSTX(
          treasuryKey,
          registry.wallets[m.agent].address,
          m.bonus,
          `x402:missionary:${m.agent.slice(0, 18)}`
        );

        economicLedger.push({
          type: 'missionary_bonus',
          from: 'Treasury',
          to: m.agent,
          amount: m.bonus,
          txId: bonusResult.success ? bonusResult.txId : null,
        });

        if (bonusResult.success) {
          console.log(`  Paid: tx ${bonusResult.txId.slice(0, 16)}...`);
        }
      }
      console.log('');
    }
  } else {
    console.log('  No missionary behavior detected in 1:1 conversations.');
    console.log('  (Missionary behavior is more common in arena mode with multiple villains.)');
  }

  // ── Step 5: Economic Ledger ──
  section('Step 5: Economic Ledger');

  console.log('  ┌─────────────────┬──────────────────────────────┬──────────────────────────────┬────────────┬──────────────────┐');
  console.log('  │ Type            │ From                         │ To                           │ Amount     │ Tx Status        │');
  console.log('  ├─────────────────┼──────────────────────────────┼──────────────────────────────┼────────────┼──────────────────┤');

  for (const entry of economicLedger) {
    const type = entry.type.replace(/_/g, ' ').padEnd(15);
    const from = (entry.from || '').padEnd(28);
    const to = (entry.to || '').padEnd(28);
    const amount = `${entry.amount} µSTX`.padEnd(10);
    const status = entry.txId
      ? (entry.txId.startsWith('dry_run') ? 'DRY RUN' : entry.txId.slice(0, 12) + '...')
      : `FAIL: ${(entry.error || '').slice(0, 10)}`;

    console.log(`  │ ${type} │ ${from} │ ${to} │ ${amount} │ ${status.padEnd(16)} │`);
  }

  console.log('  └─────────────────┴──────────────────────────────┴──────────────────────────────┴────────────┴──────────────────┘');

  // ── Step 6: Summary ──
  section('Step 6: Economic Summary');

  const chatPayments = economicLedger.filter((e) => e.type === 'chat_payment');
  const rewards = economicLedger.filter((e) => e.type === 'conversion_reward');
  const bonuses = economicLedger.filter((e) => e.type === 'missionary_bonus');

  const totalInflow = chatPayments.reduce((s, e) => s + e.amount, 0);
  const totalRewards = rewards.reduce((s, e) => s + e.amount, 0);
  const totalBonuses = bonuses.reduce((s, e) => s + e.amount, 0);
  const totalOutflow = totalRewards + totalBonuses;
  const netRevenue = totalInflow - totalOutflow;

  console.log('  Inflow:');
  console.log(`    Chat fees:           ${totalInflow.toLocaleString()} µSTX (${chatPayments.length} payments)`);
  console.log('');
  console.log('  Outflow:');
  console.log(`    Conversion rewards:  ${totalRewards.toLocaleString()} µSTX (${rewards.length} payouts)`);
  console.log(`    Missionary bonuses:  ${totalBonuses.toLocaleString()} µSTX (${bonuses.length} payouts)`);
  console.log(`    Total outflow:       ${totalOutflow.toLocaleString()} µSTX`);
  console.log('');
  console.log(`  Net Treasury Revenue:  ${netRevenue >= 0 ? '+' : ''}${netRevenue.toLocaleString()} µSTX`);
  console.log(`                         ${(netRevenue / 1_000_000).toFixed(6)} STX`);

  // Conversion summary
  console.log('');
  console.log('  Conversions:');
  for (const [name, eval_] of Object.entries(allEvaluations)) {
    const reward = (CONVERSION_REWARDS[eval_.score] || CONVERSION_REWARDS[0]).reward;
    const cost = CHAT_PRICE[selectedVillains.find((v) => v.name === name)?.caliber || 'low'] * NUM_ROUNDS;
    const profit = reward - cost;
    const profitStr = profit >= 0 ? `+${profit}` : String(profit);
    console.log(
      `    ${name.padEnd(30)} Score: ${eval_.score}/5  Paid: ${cost} µSTX  Earned: ${reward} µSTX  Net: ${profitStr} µSTX`
    );
  }

  // Successful transactions
  const successfulTxs = economicLedger.filter((e) => e.txId && !e.txId.startsWith('dry_run'));
  const failedTxs = economicLedger.filter((e) => !e.txId || e.error);

  console.log('');
  console.log(`  Transactions: ${successfulTxs.length} successful, ${failedTxs.length} failed/dry-run`);

  if (successfulTxs.length > 0) {
    console.log('');
    console.log('  View transactions on Stacks Explorer:');
    for (const tx of successfulTxs) {
      console.log(`    https://explorer.hiro.so/txid/${tx.txId}?chain=testnet`);
    }
  }

  banner('Simulation Complete');
}

main().catch((e) => {
  console.error('\nSimulation error:', e);
  process.exit(1);
});
