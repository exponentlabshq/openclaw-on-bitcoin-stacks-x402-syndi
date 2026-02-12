/* ============================================
   SYNDI x402 — Landing Page App
   Fetches data.json, renders all sections
   ============================================ */

(async function () {
  const res = await fetch('data.json');
  const data = await res.json();

  renderHero(data);
  renderProtocol(data.protocol);
  renderPricing(data.pricing);
  renderSimulations(data.simulations);
  renderRewards(data.rewards);
  renderTransactions(data.transactions);
  renderArchitecture(data.architecture);
  renderWallets(data.wallets);
  renderLessons(data.lessons);
  renderRoadmap(data.roadmap);
  renderFooter(data.meta);
  try { await initDebateLauncher(); } catch (e) { console.log('[Debate] Server not available, static fallback active'); }
  initScrollAnimations();
  initNavScroll();
})();

/* --- Hero --- */
function renderHero(data) {
  const { meta, stats } = data;

  document.getElementById('hero-title').innerHTML =
    'AI Agents as <span class="highlight">Economic Actors</span> on Bitcoin';

  document.getElementById('hero-subtitle').textContent = meta.heroDescription;
  document.getElementById('hero-tagline').textContent = meta.tagline;

  const statsEl = document.getElementById('hero-stats');
  statsEl.innerHTML = stats.map(s => `
    <div class="stat-item">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-detail">${s.detail}</div>
    </div>
  `).join('');
}

/* --- Protocol --- */
function renderProtocol(protocol) {
  document.getElementById('protocol-title').textContent = protocol.title;
  document.getElementById('protocol-subtitle').textContent = protocol.subtitle;

  const icons = {
    'arrow-right': '\u2192',
    'lock': '\uD83D\uDD12',
    'key': '\uD83D\uDD11',
    'check': '\u2713'
  };

  document.getElementById('protocol-steps').innerHTML = protocol.steps.map(step => `
    <div class="protocol-step fade-in">
      <span class="step-number">${step.number}</span>
      <div class="step-icon">${icons[step.icon] || ''}</div>
      <div class="step-title">${step.title}</div>
      <div class="step-desc">${step.description}</div>
    </div>
  `).join('');
}

/* --- Pricing --- */
function renderPricing(pricing) {
  document.getElementById('pricing-title').textContent = pricing.title;
  document.getElementById('pricing-subtitle').textContent = pricing.subtitle;

  document.getElementById('pricing-grid').innerHTML = pricing.tiers.map(tier => `
    <div class="pricing-card caliber-${tier.caliber.toLowerCase()} fade-in">
      <div class="pricing-caliber">${tier.caliber} Caliber</div>
      <div class="pricing-price">${tier.price}<span class="pricing-unit">${tier.unit}</span></div>
      <div class="pricing-model">${tier.model}</div>
      <div class="pricing-desc">${tier.description}</div>
      <div class="pricing-examples">
        ${tier.examples.map(e => `<span class="pricing-example-tag">${e}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

/* --- Simulations --- */
function renderSimulations(simulations) {
  const container = document.getElementById('simulations-container');

  container.innerHTML = simulations.map(sim => {
    const scoreClass = `score-${sim.score}`;
    const netClass = sim.netResult.startsWith('+') ? 'net-positive' : 'net-negative';

    const conversationHtml = sim.conversation.map(msg => {
      const isSyndi = msg.speaker === 'Syndi';
      return `
        <div class="sim-msg">
          <div class="sim-avatar ${isSyndi ? 'syndi' : 'villain'}">${isSyndi ? 'S' : msg.speaker.charAt(4) || 'V'}</div>
          <div class="sim-msg-content">
            <div class="sim-speaker ${isSyndi ? 'syndi' : 'villain'}">${msg.speaker}</div>
            <div class="sim-text">${escapeHtml(msg.text)}</div>
          </div>
        </div>
      `;
    }).join('');

    const linksHtml = [];
    if (sim.paymentExplorer) {
      linksHtml.push(`<a href="${sim.paymentExplorer}" target="_blank" class="sim-link">Payment Tx \u2192</a>`);
    }
    if (sim.rewardExplorer) {
      linksHtml.push(`<a href="${sim.rewardExplorer}" target="_blank" class="sim-link">Reward Tx \u2192</a>`);
    }

    return `
      <div class="sim-card fade-in">
        <div class="sim-header">
          <div class="sim-title">${sim.title}</div>
          <div class="sim-subtitle">${sim.subtitle}</div>
        </div>
        <div class="sim-meta">
          <div class="sim-meta-item">
            <span class="sim-meta-label">Caliber</span>
            <span class="sim-meta-value">${sim.caliber}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Model</span>
            <span class="sim-meta-value">${sim.model}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Rounds</span>
            <span class="sim-meta-value">${sim.rounds}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Score</span>
            <span class="sim-meta-value ${scoreClass}">${sim.score}/5 &mdash; ${sim.level}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Paid</span>
            <span class="sim-meta-value">${sim.paymentAmount}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Earned</span>
            <span class="sim-meta-value">${sim.rewardAmount}</span>
          </div>
          <div class="sim-meta-item">
            <span class="sim-meta-label">Net</span>
            <span class="sim-meta-value ${netClass}">${sim.netResult}</span>
          </div>
        </div>
        <div class="sim-conversation">${conversationHtml}</div>
        <div class="sim-evaluation">
          <div class="sim-eval-label">AI Evaluation</div>
          <div class="sim-eval-evidence">"${escapeHtml(sim.evaluation.evidence)}"</div>
          <div class="sim-eval-reasoning">${escapeHtml(sim.evaluation.reasoning)}</div>
        </div>
        ${linksHtml.length ? `<div class="sim-links">${linksHtml.join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

/* --- Rewards --- */
function renderRewards(rewards) {
  document.getElementById('rewards-title').textContent = rewards.title;
  document.getElementById('rewards-subtitle').textContent = rewards.subtitle;

  document.getElementById('rewards-scale').innerHTML = rewards.scale.map(r => `
    <div class="reward-row fade-in">
      <div class="reward-score s${r.score}">${r.score}</div>
      <div class="reward-level">${r.level}</div>
      <div class="reward-amount">${r.reward}</div>
      <div class="reward-desc">${r.description}</div>
    </div>
  `).join('');
}

/* --- Transactions --- */
function renderTransactions(tx) {
  document.getElementById('tx-title').textContent = tx.title;
  document.getElementById('tx-subtitle').textContent = tx.subtitle;

  document.getElementById('tx-list').innerHTML = tx.list.map(t => {
    const typeClass = t.type.toLowerCase().replace(/\s+/g, '-');
    const shortTx = t.txId.replace(/^0x/, '').substring(0, 12) + '...';
    return `
      <div class="tx-item fade-in">
        <span class="tx-type ${typeClass}">${t.type}</span>
        <span class="tx-description">${t.description}</span>
        <span class="tx-amount">${t.amount}</span>
        <a href="${t.explorerUrl}" target="_blank" class="tx-link">${shortTx}</a>
      </div>
    `;
  }).join('');
}

/* --- Architecture --- */
function renderArchitecture(arch) {
  document.getElementById('arch-title').textContent = arch.title;

  document.getElementById('arch-stack').innerHTML = arch.layers.map(layer => `
    <div class="arch-layer fade-in">
      <span class="arch-layer-name">${layer.name}</span>
      <span class="arch-layer-tech">${layer.tech}</span>
      <span class="arch-layer-role">${layer.role}</span>
    </div>
  `).join('');

  document.getElementById('arch-components').innerHTML = arch.components.map(comp => `
    <div class="arch-comp fade-in">
      <div class="arch-comp-file">${comp.file}</div>
      <div class="arch-comp-role">${comp.role}</div>
    </div>
  `).join('');
}

/* --- Wallets --- */
function renderWallets(wallets) {
  document.getElementById('wallets-grid').innerHTML = wallets.map(w => {
    const initial = w.name.charAt(0);
    const caliberHtml = w.caliber
      ? `<span class="wallet-caliber ${w.caliber}">${w.caliber}</span>`
      : '';
    return `
      <div class="wallet-item fade-in">
        <span class="wallet-index">#${w.index}</span>
        <div class="wallet-avatar role-${w.role}">${initial}</div>
        <div class="wallet-info">
          <div class="wallet-name">${w.name}</div>
          <div class="wallet-address">${w.address}</div>
        </div>
        ${caliberHtml}
      </div>
    `;
  }).join('');
}

/* --- Lessons --- */
function renderLessons(lessons) {
  document.getElementById('lessons-grid').innerHTML = lessons.map(l => `
    <div class="lesson-card fade-in">
      <div class="lesson-number">LESSON ${l.number}</div>
      <div class="lesson-title">${l.title}</div>
      <div class="lesson-desc">${l.description}</div>
    </div>
  `).join('');
}

/* --- Roadmap --- */
function renderRoadmap(roadmap) {
  document.getElementById('roadmap-timeline').innerHTML = roadmap.map(r => `
    <div class="roadmap-item fade-in">
      <div class="roadmap-dot ${r.status}"></div>
      <div class="roadmap-phase">${r.phase}</div>
      <div class="roadmap-status ${r.status}">${r.status}</div>
      <div class="roadmap-desc">${r.description}</div>
    </div>
  `).join('');
}

/* --- Footer --- */
function renderFooter(meta) {
  document.getElementById('footer-tagline').textContent = meta.tagline;
}

/* --- Debate Launcher --- */

let debateVillains = [];
let selectedVillain = null;
let debateActive = false;
let serverOnline = true;

const FALLBACK_VILLAINS = [
  { name: 'The Troll', caliber: 'low', model: 'gpt-4o-mini', price: 100 },
  { name: 'The AI-cels', caliber: 'low', model: 'gpt-4o-mini', price: 100 },
  { name: 'The Penguin', caliber: 'low', model: 'gpt-4o-mini', price: 100 },
  { name: 'The Drug Lord', caliber: 'low', model: 'gpt-4o-mini', price: 100 },
  { name: 'The Extrovert', caliber: 'low', model: 'gpt-4o-mini', price: 100 },
  { name: 'The Know It All', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'The False Profit', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'The Bitcoiner', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'The Thankless', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'The Nostradamus', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'What Are They Doing Here?', caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: "So You Think YOU'VE Got It Bad", caliber: 'medium', model: 'gpt-4o', price: 500 },
  { name: 'The Ascot-Wearer', caliber: 'high', model: 'gpt-4.1', price: 1000 },
  { name: 'The Scientist', caliber: 'high', model: 'gpt-4.1', price: 1000 },
  { name: 'The Professor', caliber: 'high', model: 'gpt-4.1', price: 1000 },
  { name: 'The Sage On The Stage', caliber: 'high', model: 'gpt-4.1', price: 1000 },
];

async function initDebateLauncher() {
  const selector = document.getElementById('villain-selector');
  if (!selector) return;

  try {
    const res = await fetch('/api/villains');
    if (!res.ok) throw new Error('Server unavailable');
    debateVillains = await res.json();
    serverOnline = true;
  } catch {
    debateVillains = FALLBACK_VILLAINS;
    serverOnline = false;
  }

  renderVillainSelector();
}

function renderVillainSelector() {
  const selector = document.getElementById('villain-selector');
  selector.innerHTML = debateVillains.map(v => `
    <div class="villain-card caliber-${v.caliber} fade-in" data-villain="${escapeHtml(v.name)}">
      <div class="villain-card-name">${escapeHtml(v.name)}</div>
      <div class="villain-card-meta">
        <span class="villain-card-caliber ${v.caliber}">${v.caliber}</span>
        <span class="villain-card-price">${v.price} &micro;STX/round</span>
        <span class="villain-card-model">${v.model}</span>
      </div>
    </div>
  `).join('');

  // Add launch button after the grid
  const btnHtml = `<div style="text-align:center;margin-top:1rem;">
    <button class="debate-btn" id="debate-launch-btn" disabled>Select a villain to begin</button>
  </div>`;
  selector.insertAdjacentHTML('afterend', btnHtml);

  // Card click handlers
  selector.querySelectorAll('.villain-card').forEach(card => {
    card.addEventListener('click', () => {
      if (debateActive) return;
      selector.querySelectorAll('.villain-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedVillain = card.dataset.villain;
      const btn = document.getElementById('debate-launch-btn');
      btn.textContent = `Launch Debate vs ${selectedVillain}`;
      btn.disabled = false;
    });
  });

  // Launch button handler
  document.getElementById('debate-launch-btn').addEventListener('click', () => {
    if (!selectedVillain || debateActive) return;
    launchDebate(selectedVillain);
  });
}

const PHASE_NAMES = ['Init', 'Payment', 'Debate', 'Evaluate', 'Reward'];
let currentPhaseIndex = -1;

function renderPhaseIndicator(activePhase) {
  const phases = document.getElementById('debate-phases');
  const phaseMap = { init: 0, payment: 1, debate: 2, evaluation: 3, reward: 4 };
  const newIndex = phaseMap[activePhase] ?? currentPhaseIndex;
  currentPhaseIndex = newIndex;

  phases.innerHTML = PHASE_NAMES.map((name, i) => {
    let dotClass = 'debate-phase-dot';
    if (i < currentPhaseIndex) dotClass += ' completed';
    else if (i === currentPhaseIndex) dotClass += ' active';

    let lineClass = 'debate-phase-line';
    if (i < currentPhaseIndex) lineClass += ' completed';

    const dot = `<div class="debate-phase-step">
      <div class="${dotClass}">${i < currentPhaseIndex ? '&#10003;' : (i + 1)}</div>
    </div>`;
    const line = i < PHASE_NAMES.length - 1 ? `<div class="${lineClass}"></div>` : '';
    return dot + line;
  }).join('');
}

function appendDebateMessage(speaker, text, round) {
  const container = document.getElementById('debate-messages');
  const isSyndi = speaker === 'Syndi';
  const initial = isSyndi ? 'S' : speaker.charAt(0);
  const avatarClass = isSyndi ? 'syndi' : 'villain';
  const speakerClass = isSyndi ? 'syndi' : 'villain';

  const msgHtml = `
    <div class="debate-msg">
      <div class="sim-avatar ${avatarClass}">${initial}</div>
      <div class="debate-msg-content">
        <div class="debate-msg-speaker ${speakerClass}">${escapeHtml(speaker)}</div>
        <div class="debate-msg-text">${escapeHtml(text)}</div>
        ${round > 0 ? `<div class="debate-msg-round">Round ${round}</div>` : ''}
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', msgHtml);
  container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function appendStatusMessage(icon, label, value, extraClass) {
  const container = document.getElementById('debate-messages');
  const cls = extraClass ? `debate-status ${extraClass}` : 'debate-status';
  const html = `
    <div class="${cls}">
      <div class="debate-status-icon">${icon}</div>
      <div class="debate-status-content">
        <div class="debate-status-label">${label}</div>
        <div class="debate-status-value">${value}</div>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function renderPaymentConfirmed(type, data) {
  const container = document.getElementById('debate-messages');
  if (data.status === 'confirmed') {
    const shortTx = data.txId.replace(/^0x/, '').substring(0, 16) + '...';
    const html = `
      <div class="debate-status">
        <div class="debate-status-icon">&#10003;</div>
        <div class="debate-status-content">
          <div class="debate-status-label">${type} Confirmed</div>
          <div class="debate-status-value">${data.amount} &micro;STX
            <a href="${data.explorerUrl}" target="_blank" class="debate-tx-confirmed">${shortTx} &#8599;</a>
          </div>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', html);
  } else if (data.status === 'failed') {
    appendStatusMessage('&#10007;', `${type} Failed`, data.error || 'Unknown error');
  }
}

function renderEvaluation(data) {
  const container = document.getElementById('debate-messages');
  const scoreColors = ['var(--text-muted)', 'var(--text-secondary)', 'var(--cyan)', 'var(--gold)', 'var(--orange)', 'var(--green)'];
  const color = scoreColors[data.score] || scoreColors[0];
  const evidenceHtml = (data.evidence || []).map(e => `<div class="debate-eval-evidence">"${escapeHtml(e)}"</div>`).join('');

  const html = `
    <div class="debate-evaluation">
      <div class="debate-eval-score" style="color:${color}">${data.score}/5</div>
      <div class="debate-eval-level">${escapeHtml(data.level || '')}</div>
      ${evidenceHtml}
      <div class="debate-eval-reasoning">${escapeHtml(data.reasoning || '')}</div>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function renderDebateSummary(data) {
  const summary = document.getElementById('debate-summary');
  const net = data.net;
  const netStr = (net >= 0 ? '+' : '') + net;
  const netClass = net >= 0 ? 'positive' : 'negative';
  const scoreColors = ['var(--text-muted)', 'var(--text-secondary)', 'var(--cyan)', 'var(--gold)', 'var(--orange)', 'var(--green)'];
  const scoreColor = scoreColors[data.score] || scoreColors[0];

  const links = [];
  if (data.paymentTxId) {
    links.push(`<a href="https://explorer.hiro.so/txid/${data.paymentTxId}?chain=testnet" target="_blank" class="sim-link">Payment Tx &#8594;</a>`);
  }
  if (data.rewardTxId) {
    links.push(`<a href="https://explorer.hiro.so/txid/${data.rewardTxId}?chain=testnet" target="_blank" class="sim-link">Reward Tx &#8594;</a>`);
  }

  summary.innerHTML = `
    <div class="debate-summary-title">Debate Complete: Syndi vs ${escapeHtml(data.villain)}</div>
    <div class="debate-summary-grid">
      <div class="debate-summary-stat">
        <div class="debate-summary-stat-value">${data.rounds}</div>
        <div class="debate-summary-stat-label">Rounds</div>
      </div>
      <div class="debate-summary-stat">
        <div class="debate-summary-stat-value">${data.paid} &micro;STX</div>
        <div class="debate-summary-stat-label">Paid</div>
      </div>
      <div class="debate-summary-stat">
        <div class="debate-summary-stat-value" style="color:${scoreColor}">${data.score}/5</div>
        <div class="debate-summary-stat-label">${escapeHtml(data.level)}</div>
      </div>
      <div class="debate-summary-stat">
        <div class="debate-summary-stat-value">${data.reward} &micro;STX</div>
        <div class="debate-summary-stat-label">Reward</div>
      </div>
      <div class="debate-summary-stat">
        <div class="debate-summary-stat-value debate-summary-net ${netClass}">${netStr} &micro;STX</div>
        <div class="debate-summary-stat-label">Net</div>
      </div>
    </div>
    ${links.length ? `<div class="debate-summary-links">${links.join('')}</div>` : ''}`;
  summary.style.display = 'block';
}

async function launchDebate(villainName) {
  if (!serverOnline) {
    const arena = document.getElementById('debate-arena');
    arena.style.display = 'block';
    document.getElementById('debate-messages').innerHTML = `
      <div class="debate-status">
        <div class="debate-status-icon">&#9888;</div>
        <div class="debate-status-content">
          <div class="debate-status-label">Server Required</div>
          <div class="debate-status-value">Run <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-family:'Space Mono',monospace;font-size:0.82rem;color:var(--orange)">npm start</code> then open <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-family:'Space Mono',monospace;font-size:0.82rem;color:var(--orange)">http://localhost:3402</code></div>
        </div>
      </div>`;
    arena.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  debateActive = true;
  currentPhaseIndex = -1;

  const btn = document.getElementById('debate-launch-btn');
  btn.disabled = true;
  btn.textContent = 'Debate in progress...';

  const arena = document.getElementById('debate-arena');
  const messages = document.getElementById('debate-messages');
  const summary = document.getElementById('debate-summary');
  const phases = document.getElementById('debate-phases');

  arena.style.display = 'block';
  messages.innerHTML = '';
  summary.style.display = 'none';
  summary.innerHTML = '';
  phases.innerHTML = '';

  renderPhaseIndicator('init');
  arena.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Pre-check: fetch the endpoint first to catch JSON errors (429, 500, etc.)
  // EventSource can't read non-SSE response bodies, so we validate first.
  const debateUrl = `/api/debate?villain=${encodeURIComponent(villainName)}`;
  try {
    const preCheck = await fetch(`/api/debate/check?villain=${encodeURIComponent(villainName)}`);
    if (!preCheck.ok) {
      const errData = await preCheck.json().catch(() => ({}));
      appendStatusMessage('&#10007;', 'Error', errData.error || `Server error (${preCheck.status})`);
      debateActive = false;
      btn.disabled = false;
      btn.textContent = selectedVillain ? `Launch Debate vs ${selectedVillain}` : 'Select a villain to begin';
      return;
    }
  } catch {
    appendStatusMessage('&#10007;', 'Error', 'Could not connect to server. Is it running?');
    debateActive = false;
    btn.disabled = false;
    btn.textContent = selectedVillain ? `Launch Debate vs ${selectedVillain}` : 'Select a villain to begin';
    return;
  }

  const evtSource = new EventSource(debateUrl);
  let receivedAnyEvent = false;

  function onEvent() {
    receivedAnyEvent = true;
  }

  evtSource.addEventListener('phase:init', (e) => {
    onEvent();
    const d = JSON.parse(e.data);
    renderPhaseIndicator('init');
    appendStatusMessage('&#9654;', 'Debate Starting', `${d.villain} (${d.caliber}) &mdash; ${d.rounds} rounds @ ${d.price} &micro;STX/round`);
  });

  evtSource.addEventListener('phase:payment', (e) => {
    onEvent();
    const d = JSON.parse(e.data);
    renderPhaseIndicator('payment');
    appendStatusMessage('&#9899;', 'Sending Payment', `${d.amount} &micro;STX from ${d.from} to ${d.to}...`, 'sending');
  });

  evtSource.addEventListener('payment', (e) => {
    onEvent();
    renderPaymentConfirmed('Payment', JSON.parse(e.data));
  });

  evtSource.addEventListener('phase:debate', (e) => {
    onEvent();
    renderPhaseIndicator('debate');
  });

  evtSource.addEventListener('message', (e) => {
    onEvent();
    const d = JSON.parse(e.data);
    appendDebateMessage(d.speaker, d.text, d.round);
  });

  evtSource.addEventListener('phase:evaluation', () => {
    onEvent();
    renderPhaseIndicator('evaluation');
    appendStatusMessage('&#9881;', 'AI Evaluation', 'Analyzing conversion level...', 'sending');
  });

  evtSource.addEventListener('evaluation', (e) => {
    onEvent();
    renderEvaluation(JSON.parse(e.data));
  });

  evtSource.addEventListener('phase:reward', (e) => {
    onEvent();
    const d = JSON.parse(e.data);
    renderPhaseIndicator('reward');
    if (d.status === 'sending') {
      appendStatusMessage('&#9899;', 'Sending Reward', `${d.amount} &micro;STX...`, 'sending');
    } else if (d.status === 'none') {
      appendStatusMessage('&#8212;', 'No Reward', d.reason || 'Score too low');
    }
  });

  evtSource.addEventListener('reward', (e) => {
    onEvent();
    const d = JSON.parse(e.data);
    if (d.status === 'confirmed' || d.status === 'failed') {
      renderPaymentConfirmed('Reward', d);
    }
  });

  evtSource.addEventListener('complete', (e) => {
    onEvent();
    renderDebateSummary(JSON.parse(e.data));
  });

  evtSource.addEventListener('done', () => {
    onEvent();
    evtSource.close();
    debateActive = false;
    btn.disabled = false;
    btn.textContent = selectedVillain ? `Launch Debate vs ${selectedVillain}` : 'Select a villain to begin';
  });

  evtSource.addEventListener('error', () => {
    evtSource.close();
    debateActive = false;
    btn.disabled = false;
    btn.textContent = selectedVillain ? `Launch Debate vs ${selectedVillain}` : 'Select a villain to begin';
    if (!receivedAnyEvent) {
      appendStatusMessage('&#10007;', 'Error', 'Could not connect to debate stream.');
    } else {
      appendStatusMessage('&#10007;', 'Error', 'Debate connection lost.');
    }
  });
}

/* --- Scroll Animations --- */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

/* --- Nav Scroll --- */
function initNavScroll() {
  const nav = document.getElementById('nav');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  });
}

/* --- Utility --- */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
