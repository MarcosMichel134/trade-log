/* ════════════════════════════════════════════════════════
   TRADELOG — APPLICATION PRINCIPALE
   Gestion : auth, journal, performances, abonnement, admin
════════════════════════════════════════════════════════ */

"use strict";

// ── État global ──
let currentUser    = null;
let userProfile    = null;
let allTrades      = [];
let editingTradeId = null;
let inactivityTimer = null;
let charts         = {};

// ════════════════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════════════════

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function fmt(val, dec = 2) {
  const n = parseFloat(val);
  return isNaN(n) ? '—' : n.toFixed(dec);
}

function fmtPnl(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  const s = n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  return s;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
}

function nowTs() { return firebase.firestore.Timestamp.now(); }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// ════════════════════════════════════════════════════════
//  INACTIVITÉ — DÉCONNEXION AUTO 1H
// ════════════════════════════════════════════════════════

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    showToast('Déconnexion automatique pour inactivité.', 'warning');
    setTimeout(() => auth.signOut(), 1500);
  }, INACTIVITY_TIMEOUT);
}

function startInactivityWatcher() {
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}

function stopInactivityWatcher() {
  clearTimeout(inactivityTimer);
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt => {
    document.removeEventListener(evt, resetInactivityTimer);
  });
}

// ════════════════════════════════════════════════════════
//  AUTHENTIFICATION
// ════════════════════════════════════════════════════════

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    showToast('Erreur de connexion : ' + e.message, 'error');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  auth.signOut();
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await initUserProfile(user);
    renderApp();
    startInactivityWatcher();
  } else {
    currentUser  = null;
    userProfile  = null;
    allTrades    = [];
    stopInactivityWatcher();
    showScreen('auth');
  }
});

// ════════════════════════════════════════════════════════
//  PROFIL UTILISATEUR (Firestore)
// ════════════════════════════════════════════════════════

async function initUserProfile(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const profile = {
      uid:          user.uid,
      displayName:  user.displayName || '',
      email:        user.email || '',
      photoURL:     user.photoURL || '',
      createdAt:    nowTs(),
      trialStart:   nowTs(),
      subStatus:    'trial',   // trial | active | expired | pending
      subEnd:       null,
      pendingTxHash: null,
      isAdmin:      user.uid === ADMIN_UID,
    };
    await ref.set(profile);
    userProfile = profile;
  } else {
    userProfile = snap.data();
    userProfile.isAdmin = (user.uid === ADMIN_UID);
    // Vérifier expiration
    await checkSubscriptionStatus(ref);
  }
}

async function checkSubscriptionStatus(ref) {
  if (!userProfile) return;

  // Admin : pas d'abonnement
  if (userProfile.isAdmin) { userProfile.subStatus = 'admin'; return; }

  const now = new Date();

  if (userProfile.subStatus === 'active' && userProfile.subEnd) {
    const end = userProfile.subEnd.toDate ? userProfile.subEnd.toDate() : new Date(userProfile.subEnd);
    if (now > end) {
      userProfile.subStatus = 'expired';
      await ref.update({ subStatus: 'expired' });
    }
  } else if (userProfile.subStatus === 'trial' || !userProfile.subStatus) {
    const start = userProfile.trialStart.toDate
      ? userProfile.trialStart.toDate()
      : new Date(userProfile.trialStart);
    const trialEnd = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    if (now > trialEnd) {
      userProfile.subStatus = 'expired';
      await ref.update({ subStatus: 'expired' });
    }
  }
}

function canEdit() {
  if (!userProfile) return false;
  if (userProfile.isAdmin) return true;
  return ['trial', 'active'].includes(userProfile.subStatus);
}

function trialDaysLeft() {
  if (!userProfile || !userProfile.trialStart) return 0;
  const start = userProfile.trialStart.toDate
    ? userProfile.trialStart.toDate()
    : new Date(userProfile.trialStart);
  const end = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ════════════════════════════════════════════════════════
//  NAVIGATION / RENDU
// ════════════════════════════════════════════════════════

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const t = document.getElementById(`${name}-screen`);
  if (t) t.classList.add('active');
}

function showSection(name) {
  // Bloquer l'accès admin aux non-admins
  if (name === 'admin' && !userProfile?.isAdmin) {
    showToast('Accès réservé à l\'administrateur.', 'error');
    return;
  }
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const t = document.getElementById(`section-${name}`);
  if (t) t.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.section === name);
  });
  if (name === 'performance') renderPerformance();
  if (name === 'admin') renderAdmin();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

document.querySelectorAll('.subscribe-link').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showSection(l.dataset.section); });
});

function renderApp() {
  showScreen('app');

  // User info
  document.getElementById('user-avatar').src = currentUser.photoURL || '';
  const name = (currentUser.displayName || '').split(' ')[0];
  document.getElementById('user-name').textContent = name;

  // Badge abonnement
  const badge = document.getElementById('sub-badge');
  if (userProfile.isAdmin) {
    badge.textContent = 'Admin';
    badge.className = 'sub-badge active';
  } else if (userProfile.subStatus === 'trial') {
    badge.textContent = `Essai (J-${trialDaysLeft()})`;
    badge.className = 'sub-badge trial';
  } else if (userProfile.subStatus === 'active') {
    const end = userProfile.subEnd.toDate ? userProfile.subEnd.toDate() : new Date(userProfile.subEnd);
    badge.textContent = `Pro · ${end.toLocaleDateString('fr-FR')}`;
    badge.className = 'sub-badge active';
  } else {
    badge.textContent = 'Expiré';
    badge.className = 'sub-badge expired';
  }

  // Admin nav — toujours masquer d'abord, puis afficher uniquement pour l'admin
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  if (userProfile.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  // Bannières
  renderBanners();

  // Wallet
  document.getElementById('wallet-address').textContent = USDT_WALLET;

  // Charger trades
  loadTrades();
  renderSubscriptionPage();
}

function renderBanners() {
  const trial   = document.getElementById('trial-banner');
  const expired = document.getElementById('expired-banner');

  trial.classList.add('hidden');
  expired.classList.add('hidden');

  if (!userProfile || userProfile.isAdmin) return;

  if (userProfile.subStatus === 'trial') {
    const d = trialDaysLeft();
    if (d <= 7) {
      trial.textContent = `⏳ Il vous reste ${d} jour(s) d'essai gratuit. Abonnez-vous pour continuer.`;
      trial.classList.remove('hidden');
    }
  } else if (userProfile.subStatus === 'expired' || userProfile.subStatus === 'pending') {
    expired.classList.remove('hidden');
  }
}

// ════════════════════════════════════════════════════════
//  JOURNAL — TRADES
// ════════════════════════════════════════════════════════

let tradesUnsubscribe = null;

function loadTrades() {
  if (tradesUnsubscribe) tradesUnsubscribe();
  const uid = currentUser.uid;

  tradesUnsubscribe = db
    .collection('users').doc(uid).collection('trades')
    .orderBy('date', 'desc')
    .onSnapshot(snap => {
      allTrades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTradesTable(allTrades);
      populatePairFilter();
    }, err => {
      showToast('Erreur chargement trades : ' + err.message, 'error');
    });
}

function renderTradesTable(trades) {
  const tbody = document.getElementById('trades-tbody');
  tbody.innerHTML = '';

  if (!trades.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="14">Aucun trade enregistré.</td></tr>';
    document.getElementById('table-stats').textContent = '';
    return;
  }

  const frag = document.createDocumentFragment();
  trades.forEach(t => {
    const tr = document.createElement('tr');
    const pnlVal = parseFloat(t.pnl) || 0;
    const pnlClass = pnlVal >= 0 ? 'pnl-pos' : 'pnl-neg';
    const resultTag = { win: '<span class="tag-win">✅ Gain</span>', loss: '<span class="tag-loss">❌ Perte</span>', be: '<span class="tag-be">➖ BE</span>' }[t.result] || '—';
    const dirTag = t.direction === 'long'
      ? '<span class="tag-long">▲ Long</span>'
      : '<span class="tag-short">▼ Short</span>';

    const editable = canEdit();
    tr.innerHTML = `
      <td>${fmtDate(t.date)}</td>
      <td><strong>${t.pair || '—'}</strong></td>
      <td>${dirTag}</td>
      <td>${fmt(t.entry)}</td>
      <td>${fmt(t.sl) !== 'NaN' ? fmt(t.sl) : '—'}</td>
      <td>${fmt(t.tp) !== 'NaN' ? fmt(t.tp) : '—'}</td>
      <td>${fmt(t.exit)}</td>
      <td>${fmt(t.size)}</td>
      <td class="${pnlClass}">${fmtPnl(t.pnl)}</td>
      <td>${fmt(t.rr)}</td>
      <td>${resultTag}</td>
      <td>${t.strategy || '—'}</td>
      <td title="${t.notes || ''}">${(t.notes || '').substring(0,30)}${t.notes?.length > 30 ? '…' : ''}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="openEditTrade('${t.id}')" ${!editable ? 'disabled title="Abonnement requis"' : ''}>✏️</button>
          <button class="btn-delete" onclick="deleteTrade('${t.id}')" ${!editable ? 'disabled title="Abonnement requis"' : ''}>🗑️</button>
        </div>
      </td>`;
    frag.appendChild(tr);
  });

  tbody.appendChild(frag);

  // Stats bas de tableau
  const wins   = trades.filter(t => t.result === 'win').length;
  const losses = trades.filter(t => t.result === 'loss').length;
  const totalPnl = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
  const wr = trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0;
  document.getElementById('table-stats').innerHTML =
    `<span>${trades.length} trades</span><span>Win: ${wins} | Loss: ${losses}</span><span>Total P&L: <b class="${totalPnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtPnl(totalPnl)}</b></span><span>Win Rate: ${wr}%</span>`;
}

function populatePairFilter() {
  const sel = document.getElementById('pair-filter');
  const pairs = [...new Set(allTrades.map(t => t.pair).filter(Boolean))].sort();
  const curr = sel.value;
  sel.innerHTML = '<option value="">Toutes paires</option>';
  pairs.forEach(p => {
    const o = document.createElement('option');
    o.value = o.textContent = p;
    sel.appendChild(o);
  });
  sel.value = curr;
}

// ── Filtres ──
['search-filter','pair-filter','result-filter','date-from','date-to'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', applyFilters);
});

document.getElementById('clear-filters').addEventListener('click', () => {
  ['search-filter','pair-filter','result-filter','date-from','date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderTradesTable(allTrades);
});

function applyFilters() {
  const search = document.getElementById('search-filter').value.toLowerCase();
  const pair   = document.getElementById('pair-filter').value;
  const result = document.getElementById('result-filter').value;
  const from   = document.getElementById('date-from').value;
  const to     = document.getElementById('date-to').value;

  const filtered = allTrades.filter(t => {
    if (pair && t.pair !== pair) return false;
    if (result && t.result !== result) return false;
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    if (from && d < new Date(from)) return false;
    if (to && d > new Date(to + 'T23:59:59')) return false;
    if (search) {
      const hay = [t.pair, t.strategy, t.notes, t.direction].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  renderTradesTable(filtered);
}

// ── Ajouter / Éditer ──
document.getElementById('add-trade-btn').addEventListener('click', () => {
  if (!canEdit()) { showToast('Abonnement requis pour ajouter des trades.', 'warning'); return; }
  openTradeModal();
});

document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('cancel-trade-btn').addEventListener('click', closeModal);
document.querySelector('.modal-overlay').addEventListener('click', closeModal);

function openTradeModal(trade = null) {
  editingTradeId = trade?.id || null;
  document.getElementById('modal-title').textContent = trade ? 'Modifier le Trade' : 'Ajouter un Trade';

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  document.getElementById('f-date').value      = trade ? formatDatetimeLocal(trade.date) : now.toISOString().slice(0, 16);
  document.getElementById('f-pair').value      = trade?.pair || '';
  document.getElementById('f-direction').value = trade?.direction || 'long';
  document.getElementById('f-entry').value     = trade?.entry || '';
  document.getElementById('f-sl').value        = trade?.sl || '';
  document.getElementById('f-tp').value        = trade?.tp || '';
  document.getElementById('f-exit').value      = trade?.exit || '';
  document.getElementById('f-size').value      = trade?.size || '';
  document.getElementById('f-pnl').value       = trade?.pnl || '';
  document.getElementById('f-rr').value        = trade?.rr || '';
  document.getElementById('f-result').value    = trade?.result || 'win';
  document.getElementById('f-strategy').value  = trade?.strategy || '';
  document.getElementById('f-notes').value     = trade?.notes || '';
  document.getElementById('f-screenshot').value = trade?.screenshot || '';

  document.getElementById('trade-modal').classList.remove('hidden');
}

function formatDatetimeLocal(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function closeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
  editingTradeId = null;
}

function openEditTrade(id) {
  if (!canEdit()) { showToast('Abonnement requis.', 'warning'); return; }
  const trade = allTrades.find(t => t.id === id);
  if (trade) openTradeModal(trade);
}

document.getElementById('save-trade-btn').addEventListener('click', saveTrade);

async function saveTrade() {
  if (!canEdit()) { showToast('Abonnement requis.', 'warning'); return; }

  const pair = document.getElementById('f-pair').value.trim();
  const dateVal = document.getElementById('f-date').value;
  if (!pair || !dateVal) { showToast('Paire et date sont obligatoires.', 'error'); return; }

  const data = {
    date:       firebase.firestore.Timestamp.fromDate(new Date(dateVal)),
    pair:       pair.toUpperCase(),
    direction:  document.getElementById('f-direction').value,
    entry:      parseFloat(document.getElementById('f-entry').value) || null,
    sl:         parseFloat(document.getElementById('f-sl').value) || null,
    tp:         parseFloat(document.getElementById('f-tp').value) || null,
    exit:       parseFloat(document.getElementById('f-exit').value) || null,
    size:       parseFloat(document.getElementById('f-size').value) || null,
    pnl:        parseFloat(document.getElementById('f-pnl').value) || null,
    rr:         parseFloat(document.getElementById('f-rr').value) || null,
    result:     document.getElementById('f-result').value,
    strategy:   document.getElementById('f-strategy').value.trim(),
    notes:      document.getElementById('f-notes').value.trim(),
    screenshot: document.getElementById('f-screenshot').value.trim(),
    updatedAt:  nowTs(),
  };

  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('trades');
    if (editingTradeId) {
      await ref.doc(editingTradeId).update(data);
      showToast('Trade mis à jour.', 'success');
    } else {
      data.createdAt = nowTs();
      await ref.add(data);
      showToast('Trade ajouté.', 'success');
    }
    closeModal();
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

async function deleteTrade(id) {
  if (!canEdit()) { showToast('Abonnement requis.', 'warning'); return; }
  if (!confirm('Supprimer ce trade ?')) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('trades').doc(id).delete();
    showToast('Trade supprimé.', 'success');
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Export CSV ──
document.getElementById('export-btn').addEventListener('click', exportCSV);

function exportCSV() {
  if (!allTrades.length) { showToast('Aucun trade à exporter.', 'warning'); return; }
  const headers = ['Date','Paire','Direction','Entrée','SL','TP','Sortie','Taille','PnL','RR','Résultat','Stratégie','Notes'];
  const rows = allTrades.map(t => [
    fmtDate(t.date), t.pair, t.direction, t.entry, t.sl, t.tp,
    t.exit, t.size, t.pnl, t.rr, t.result, t.strategy, `"${(t.notes||'').replace(/"/g,'""')}"`
  ].map(v => v ?? '').join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
  a.download = `tradelog_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export CSV téléchargé.', 'success');
}

// ════════════════════════════════════════════════════════
//  PERFORMANCES
// ════════════════════════════════════════════════════════

document.getElementById('perf-period').addEventListener('change', renderPerformance);

function filterByPeriod(trades, period) {
  if (period === 'all') return trades;
  const now = new Date();
  const cutoffs = { week: 7, month: 30, '3months': 90 };
  const days = cutoffs[period] || 9999;
  const cutoff = daysAgo(days);
  return trades.filter(t => {
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    return d >= cutoff;
  });
}

function renderPerformance() {
  const period = document.getElementById('perf-period').value;
  const trades = filterByPeriod(allTrades, period);

  const wins   = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result === 'loss');
  const totalPnl = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
  const winRate = trades.length ? (wins.length / trades.length * 100) : 0;
  const rrs = trades.map(t => parseFloat(t.rr)).filter(v => !isNaN(v));
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
  const pnls = trades.map(t => parseFloat(t.pnl) || 0);
  const best = pnls.length ? Math.max(...pnls) : 0;
  const worst = pnls.length ? Math.min(...pnls) : 0;

  const grossWin  = wins.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0));
  const pf = grossLoss ? (grossWin / grossLoss) : grossWin > 0 ? Infinity : 0;

  // Série gagnante max
  let streak = 0, maxStreak = 0, cur = 0;
  [...trades].reverse().forEach(t => {
    if (t.result === 'win') { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  });

  document.getElementById('kpi-pnl').textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
  document.getElementById('kpi-pnl').className = `kpi-value ${totalPnl >= 0 ? 'positive' : 'negative'}`;
  document.getElementById('kpi-winrate').textContent = `${winRate.toFixed(1)}%`;
  document.getElementById('kpi-total').textContent = trades.length;
  document.getElementById('kpi-best').textContent = `+$${best.toFixed(2)}`;
  document.getElementById('kpi-worst').textContent = `-$${Math.abs(worst).toFixed(2)}`;
  document.getElementById('kpi-rr').textContent = avgRR.toFixed(2);
  document.getElementById('kpi-pf').textContent = isFinite(pf) ? pf.toFixed(2) : '∞';
  document.getElementById('kpi-streak').textContent = maxStreak;

  renderCharts(trades);
}

function renderCharts(trades) {
  const chartDefaults = {
    responsive: true,
    plugins: { legend: { labels: { color: '#8a96a8', font: { family: "'IBM Plex Mono'" } } } },
    scales: {
      x: { ticks: { color: '#5a6475' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#5a6475' }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };

  // ── Courbe de capital ──
  destroyChart('equity');
  const sorted = [...trades].sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return da - db2;
  });
  let cum = 0;
  const eqLabels = sorted.map(t => {
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
  });
  const eqData = sorted.map(t => { cum += parseFloat(t.pnl) || 0; return parseFloat(cum.toFixed(2)); });

  const eqCtx = document.getElementById('equity-chart').getContext('2d');
  const gradient = eqCtx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(0,212,170,0.3)');
  gradient.addColorStop(1, 'rgba(0,212,170,0)');

  charts.equity = new Chart(eqCtx, {
    type: 'line',
    data: {
      labels: eqLabels,
      datasets: [{ label: 'Capital cumulé ($)', data: eqData, borderColor: '#00d4aa', backgroundColor: gradient, tension: 0.3, fill: true, pointRadius: 3, pointBackgroundColor: '#00d4aa' }]
    },
    options: { ...chartDefaults }
  });

  // ── Pie ──
  destroyChart('pie');
  const wins = trades.filter(t => t.result === 'win').length;
  const losses = trades.filter(t => t.result === 'loss').length;
  const bes = trades.filter(t => t.result === 'be').length;
  charts.pie = new Chart(document.getElementById('pie-chart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Gains', 'Pertes', 'Break-even'],
      datasets: [{ data: [wins, losses, bes], backgroundColor: ['#00d4aa','#ff4d6d','#5a6475'], borderWidth: 2, borderColor: '#10141a' }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#8a96a8' } } }, cutout: '65%' }
  });

  // ── P&L par paire ──
  destroyChart('pair');
  const pairMap = {};
  trades.forEach(t => {
    if (!t.pair) return;
    pairMap[t.pair] = (pairMap[t.pair] || 0) + (parseFloat(t.pnl) || 0);
  });
  const pairs = Object.keys(pairMap).sort((a,b) => pairMap[b] - pairMap[a]).slice(0, 10);
  charts.pair = new Chart(document.getElementById('pair-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: pairs,
      datasets: [{ label: 'P&L ($)', data: pairs.map(p => parseFloat(pairMap[p].toFixed(2))),
        backgroundColor: pairs.map(p => pairMap[p] >= 0 ? 'rgba(0,212,170,0.7)' : 'rgba(255,77,109,0.7)'),
        borderRadius: 4 }]
    },
    options: { ...chartDefaults }
  });

  // ── P&L par jour ──
  destroyChart('weekday');
  const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const dayPnl = Array(7).fill(0);
  trades.forEach(t => {
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    const idx = (d.getDay() + 6) % 7;
    dayPnl[idx] += parseFloat(t.pnl) || 0;
  });
  charts.weekday = new Chart(document.getElementById('weekday-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{ label: 'P&L ($)', data: dayPnl.map(v => parseFloat(v.toFixed(2))),
        backgroundColor: dayPnl.map(v => v >= 0 ? 'rgba(0,212,170,0.7)' : 'rgba(255,77,109,0.7)'),
        borderRadius: 4 }]
    },
    options: { ...chartDefaults }
  });
}

// ════════════════════════════════════════════════════════
//  ABONNEMENT
// ════════════════════════════════════════════════════════

function renderSubscriptionPage() {
  const display = document.getElementById('sub-status-display');
  const paySection = document.getElementById('payment-section');

  display.style.display = 'none';
  paySection.style.display = 'block';

  if (!userProfile || userProfile.isAdmin) {
    display.textContent = '🛡️ Compte administrateur — aucun abonnement requis.';
    display.className = 'sub-status-display active-sub';
    display.style.display = 'block';
    paySection.style.display = 'none';
    return;
  }

  if (userProfile.subStatus === 'active' && userProfile.subEnd) {
    const end = userProfile.subEnd.toDate ? userProfile.subEnd.toDate() : new Date(userProfile.subEnd);
    display.textContent = `✅ Abonnement actif jusqu'au ${end.toLocaleDateString('fr-FR')}`;
    display.className = 'sub-status-display active-sub';
    display.style.display = 'block';
    paySection.querySelector('h3').textContent = 'Renouveler votre abonnement';
  } else if (userProfile.subStatus === 'pending') {
    display.textContent = '⏳ Paiement soumis — en attente de validation par l\'admin (sous 24h).';
    display.className = 'sub-status-display pending-sub';
    display.style.display = 'block';
    paySection.style.display = 'none';
  }
}

document.getElementById('copy-wallet').addEventListener('click', () => {
  navigator.clipboard.writeText(USDT_WALLET).then(() => showToast('Adresse copiée !', 'success'));
});

document.getElementById('submit-payment-btn').addEventListener('click', submitPayment);

async function submitPayment() {
  const txHash = document.getElementById('tx-hash').value.trim();
  if (!txHash || txHash.length < 10) { showToast('Entrez un hash de transaction valide.', 'error'); return; }

  try {
    const ref = db.collection('users').doc(currentUser.uid);
    await ref.update({
      subStatus:    'pending',
      pendingTxHash: txHash,
      pendingAt:    nowTs(),
    });
    userProfile.subStatus = 'pending';
    userProfile.pendingTxHash = txHash;

    showToast('Paiement soumis ! Validation sous 24h.', 'success');
    renderSubscriptionPage();
    renderBanners();

    // Badge
    const badge = document.getElementById('sub-badge');
    badge.textContent = 'En attente';
    badge.className = 'sub-badge trial';
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════

async function renderAdmin() {
  if (!userProfile?.isAdmin) {
    showToast('Accès refusé.', 'error');
    showSection('journal');
    return;
  }
  // Lancer les listeners temps réel
  loadAdminPerf();
  loadUsers();
  loadPendingPayments();
}

// ── Performances Admin ──
document.getElementById('save-admin-perf').addEventListener('click', saveAdminPerf);

async function saveAdminPerf() {
  const data = {
    period:  document.getElementById('admin-period-label').value.trim(),
    winrate: parseFloat(document.getElementById('admin-winrate').value) || 0,
    pnl:     parseFloat(document.getElementById('admin-pnl').value) || 0,
    trades:  parseInt(document.getElementById('admin-trades').value) || 0,
    rr:      parseFloat(document.getElementById('admin-rr').value) || 0,
    createdAt: nowTs(),
  };
  if (!data.period) { showToast('Période requise.', 'error'); return; }

  try {
    await db.collection('adminPerformances').add(data);
    showToast('Performance sauvegardée.', 'success');
    loadAdminPerf();
    ['admin-period-label','admin-winrate','admin-pnl','admin-trades','admin-rr'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

async function loadAdminPerf() {
  const snap = await db.collection('adminPerformances').orderBy('createdAt', 'desc').limit(20).get();
  const container = document.getElementById('admin-perf-list');
  container.innerHTML = '';
  if (snap.empty) { container.innerHTML = '<p style="color:var(--text3)">Aucune performance enregistrée.</p>'; return; }
  snap.docs.forEach(d => {
    const p = d.data();
    const div = document.createElement('div');
    div.className = 'perf-entry';
    div.innerHTML = `
      <span class="period">${p.period}</span>
      <span class="stat">Win Rate: <span>${p.winrate}%</span></span>
      <span class="stat">P&L: <span>${fmtPnl(p.pnl)}</span></span>
      <span class="stat">Trades: <span>${p.trades}</span></span>
      <span class="stat">R:R: <span>${fmt(p.rr)}</span></span>
      <button class="btn-delete" onclick="deleteAdminPerf('${d.id}')">🗑️</button>`;
    container.appendChild(div);
  });
}

async function deleteAdminPerf(id) {
  if (!confirm('Supprimer cette performance ?')) return;
  await db.collection('adminPerformances').doc(id).delete();
  loadAdminPerf();
  showToast('Supprimé.', 'success');
}

// ── Utilisateurs (temps réel) ──
let allUsers = [];
let usersUnsubscribe = null;

function loadUsers() {
  if (usersUnsubscribe) usersUnsubscribe();

  usersUnsubscribe = db.collection('users')
    .orderBy('createdAt', 'desc')
    .onSnapshot(async snap => {
      // Récupérer les données de base de tous les utilisateurs
      const users = snap.docs.map(d => {
        const data = d.data();
        // S'assurer que uid est bien défini (utiliser l'id du document si uid manquant)
        return { ...data, uid: data.uid || d.id, docId: d.id };
      });

      // Charger le nombre de trades et le P&L total pour chaque utilisateur
      await Promise.all(users.map(async u => {
        try {
          const ts = await db.collection('users').doc(u.docId).collection('trades').get();
          u.tradeCount = ts.size;
          u.totalPnl   = ts.docs.reduce((a, d2) => a + (parseFloat(d2.data().pnl) || 0), 0);
        } catch(e) {
          u.tradeCount = 0;
          u.totalPnl   = 0;
        }
      }));

      allUsers = users;
      renderUsersTable(allUsers);
    }, err => {
      console.error('Erreur chargement utilisateurs:', err);
      const tbody = document.getElementById('users-tbody');
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Erreur: ${err.message}</td></tr>`;
    });
}

document.getElementById('admin-search-user').addEventListener('input', filterUsers);
document.getElementById('admin-filter-sub').addEventListener('change', filterUsers);

function filterUsers() {
  const search = document.getElementById('admin-search-user').value.toLowerCase();
  const sub    = document.getElementById('admin-filter-sub').value;
  const filtered = allUsers.filter(u => {
    if (sub && u.subStatus !== sub) return false;
    if (search && !`${u.displayName} ${u.email}`.toLowerCase().includes(search)) return false;
    return true;
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  if (!users.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Aucun utilisateur inscrit.</td></tr>'; return;
  }
  users.forEach(u => {
    const tr = document.createElement('tr');
    const subEnd = u.subEnd
      ? (u.subEnd.toDate ? u.subEnd.toDate() : new Date(u.subEnd)).toLocaleDateString('fr-FR')
      : '—';
    const statusBadge = {
      trial:   '<span style="color:var(--warning)">⏳ Essai</span>',
      active:  '<span style="color:var(--positive)">✅ Actif</span>',
      expired: '<span style="color:var(--negative)">❌ Expiré</span>',
      pending: '<span style="color:var(--info)">🕐 En attente</span>',
      admin:   '<span style="color:var(--accent)">🛡️ Admin</span>',
    }[u.subStatus] || u.subStatus;

    // Utiliser docId (= uid) pour les actions Firestore
    const uid = u.docId;
    const isAdminUser = u.isAdmin || uid === ADMIN_UID;

    tr.innerHTML = `
      <td>
        <img src="${u.photoURL||''}" 
             onerror="this.style.display='none'"
             style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:8px"/>
        ${u.displayName||'—'}
      </td>
      <td>${u.email||'—'}</td>
      <td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('fr-FR') : '—'}</td>
      <td>${statusBadge}</td>
      <td>${subEnd}</td>
      <td>${u.tradeCount||0}</td>
      <td class="${(u.totalPnl||0) >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtPnl(u.totalPnl||0)}</td>
      <td>
        <div class="action-btns">
          ${isAdminUser
            ? '<span style="color:var(--text3);font-size:0.75rem">Admin</span>'
            : `<button class="btn-approve" onclick="activateSubscription('${uid}')">✅ Activer</button>
               <button class="btn-reject"  onclick="revokeSubscription('${uid}')">🚫 Révoquer</button>`
          }
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function activateSubscription(uid) {
  const subEnd = new Date();
  subEnd.setDate(subEnd.getDate() + SUB_DAYS);
  try {
    await db.collection('users').doc(uid).update({
      subStatus:    'active',
      subEnd:       firebase.firestore.Timestamp.fromDate(subEnd),
      pendingTxHash: null,
      pendingAt:    null,
    });
    showToast('Abonnement activé.', 'success');
    loadUsers();
    loadPendingPayments();
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

async function revokeSubscription(uid) {
  if (!confirm('Révoquer l\'abonnement de cet utilisateur ?')) return;
  try {
    await db.collection('users').doc(uid).update({ subStatus: 'expired', subEnd: null });
    showToast('Abonnement révoqué.', 'success');
    loadUsers();
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Paiements en attente (temps réel) ──
let pendingUnsubscribe = null;

function loadPendingPayments() {
  if (pendingUnsubscribe) pendingUnsubscribe();

  pendingUnsubscribe = db.collection('users')
    .where('subStatus', '==', 'pending')
    .onSnapshot(snap => {
      const container = document.getElementById('pending-payments-list');
      container.innerHTML = '';

      if (snap.empty) {
        container.innerHTML = '<p style="color:var(--text3);padding:12px">✅ Aucune demande de paiement en attente.</p>';
        return;
      }

      snap.docs.forEach(d => {
        const u = d.data();
        const docId = d.id; // L'id du document = uid de l'utilisateur
        const pendingDate = u.pendingAt
          ? (u.pendingAt.toDate ? u.pendingAt.toDate() : new Date(u.pendingAt)).toLocaleString('fr-FR')
          : '—';

        const div = document.createElement('div');
        div.className = 'pending-item';
        div.innerHTML = `
          <div class="user-info-text">
            <strong>${u.displayName || '—'}</strong>
            <br/>
            <span style="color:var(--text2);font-size:0.78rem">${u.email || '—'}</span>
            <br/>
            <span style="color:var(--text3);font-size:0.72rem">Soumis le : ${pendingDate}</span>
          </div>
          <div class="tx-info">
            <span style="color:var(--text2);font-size:0.72rem">Hash TX :</span><br/>
            ${u.pendingTxHash || '<em style="color:var(--text3)">Non fourni</em>'}
          </div>
          <div class="action-btns">
            <button class="btn-approve" onclick="activateSubscription('${docId}')">✅ Approuver</button>
            <button class="btn-reject"  onclick="rejectPayment('${docId}')">❌ Refuser</button>
          </div>`;
        container.appendChild(div);
      });
    }, err => {
      console.error('Erreur paiements en attente:', err);
      document.getElementById('pending-payments-list').innerHTML =
        `<p style="color:var(--negative)">Erreur: ${err.message}</p>`;
    });
}

async function rejectPayment(uid) {
  if (!confirm('Refuser ce paiement ?')) return;
  try {
    await db.collection('users').doc(uid).update({
      subStatus: 'expired',
      pendingTxHash: null,
      pendingAt: null,
    });
    showToast('Paiement refusé.', 'success');
    loadPendingPayments();
    loadUsers();
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}
