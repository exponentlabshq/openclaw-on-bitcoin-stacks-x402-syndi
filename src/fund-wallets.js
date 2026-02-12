/**
 * Fund Agent Wallets — Request testnet STX from the Hiro faucet.
 *
 * The faucet is rate-limited (one request per ~60 seconds).
 * This script funds wallets sequentially with proper delays.
 *
 * Usage:
 *   node fund-wallets.js                          — fund all wallets
 *   node fund-wallets.js Treasury Syndi "The Troll" — fund specific wallets
 *
 * Each faucet request grants ~500 STX on testnet.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { loadRegistry, getBalance } = require('./wallet-manager');

const STACKS_API = process.env.STACKS_API_URL || 'https://api.testnet.hiro.so';
const DELAY_MS = 65_000; // 65 seconds between faucet requests

async function fundWallet(address) {
  const url = `${STACKS_API}/extended/v1/faucets/stx?address=${address}&stacking=false`;
  const response = await fetch(url, { method: 'POST' });

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || '60';
    return { success: false, error: `Rate limited — retry after ${retryAfter}s` };
  }

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 100)}` };
  }

  const data = await response.json();
  return {
    success: true,
    txId: data.txId || data.txid || data.tx_id || 'submitted',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const registry = loadRegistry();
  if (!registry) {
    console.error('No wallet-registry.json found. Run: npm run create-wallets');
    process.exit(1);
  }

  // Determine which wallets to fund
  const requestedNames = process.argv.slice(2);
  const entries = Object.entries(registry.wallets)
    .filter(([name]) => requestedNames.length === 0 || requestedNames.includes(name));

  if (entries.length === 0) {
    console.error('No matching wallets found.');
    process.exit(1);
  }

  console.log(`\n  Funding ${entries.length} wallets on Stacks testnet`);
  console.log(`  API: ${STACKS_API}`);
  console.log(`  Delay between requests: ${DELAY_MS / 1000}s\n`);

  const results = [];

  for (let i = 0; i < entries.length; i++) {
    const [name, info] = entries[i];
    const progress = `[${i + 1}/${entries.length}]`;

    process.stdout.write(`  ${progress} ${name.padEnd(30)} ${info.address.slice(0, 16)}... `);

    const result = await fundWallet(info.address);

    if (result.success) {
      console.log(`OK (tx: ${result.txId})`);
      results.push({ name, address: info.address, funded: true, txId: result.txId });
    } else {
      console.log(`FAIL: ${result.error}`);
      results.push({ name, address: info.address, funded: false, error: result.error });

      // If rate limited, wait extra before next attempt
      if (result.error.includes('Rate limited')) {
        const waitExtra = 30_000;
        console.log(`  Waiting extra ${waitExtra / 1000}s due to rate limit...`);
        await sleep(waitExtra);
      }
    }

    // Wait between requests (skip after last one)
    if (i < entries.length - 1) {
      const remaining = entries.length - i - 1;
      const etaMin = Math.ceil((remaining * DELAY_MS) / 60_000);
      console.log(`  Waiting ${DELAY_MS / 1000}s... (${remaining} remaining, ~${etaMin} min ETA)`);
      await sleep(DELAY_MS);
    }
  }

  // Summary
  const funded = results.filter((r) => r.funded);
  const failed = results.filter((r) => !r.funded);

  console.log('\n  ── Summary ──');
  console.log(`  Funded: ${funded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.map((f) => f.name).join(', ')}`);
  }

  // Check balances of funded wallets
  if (funded.length > 0) {
    console.log('\n  Checking balances (may take a minute to propagate)...\n');
    await sleep(5000);
    for (const r of funded) {
      try {
        const bal = await getBalance(r.address);
        console.log(`  ${r.name.padEnd(30)} ${bal.stx.toFixed(2)} STX`);
      } catch (e) {
        console.log(`  ${r.name.padEnd(30)} (balance check failed)`);
      }
    }
  }

  console.log('');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
