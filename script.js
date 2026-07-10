/**
 * script.js — ScoreKeep Pro
 * Handles: UI, game logic, sports, timer, confetti, sound,
 *          tournament brackets, charts, settings, nav, wake lock
 */

'use strict';

/* =============================================
   SPORT DEFINITIONS
   ============================================= */
const SPORTS = {
  pickleball: {
    id: 'pickleball', label: 'Pickleball', icon: '🏓',
    defaults: { winScore: 11, winByTwo: true, sets: 1, serveTracking: true, sideSwitching: true, scoreIncrements: [1], timedMatch: false },
  },
  volleyball: {
    id: 'volleyball', label: 'Volleyball', icon: '🏐',
    defaults: { winScore: 25, winByTwo: true, sets: 5, serveTracking: true, sideSwitching: false, scoreIncrements: [1], timedMatch: false },
  },
  tennis: {
    id: 'tennis', label: 'Tennis', icon: '🎾',
    defaults: { winScore: 6, winByTwo: true, sets: 3, serveTracking: true, sideSwitching: true, scoreIncrements: [1], timedMatch: false },
  },
  basketball: {
    id: 'basketball', label: 'Basketball', icon: '🏀',
    defaults: { winScore: 0, winByTwo: false, sets: 1, serveTracking: false, sideSwitching: false, scoreIncrements: [1, 2, 3], timedMatch: true },
  },
  soccer: {
    id: 'soccer', label: 'Soccer', icon: '⚽',
    defaults: { winScore: 0, winByTwo: false, sets: 1, serveTracking: false, sideSwitching: true, scoreIncrements: [1], timedMatch: true },
  },
};

/* =============================================
   GAME STATE
   ============================================= */
const DEFAULT_STATE = () => ({
  sport: 'pickleball',
  teamA: 'Team A',
  teamB: 'Team B',
  scoreA: 0,
  scoreB: 0,
  setsA: 0,
  setsB: 0,
  setScores: [],         // [{a, b}]
  currentSet: 1,
  serving: 'a',          // 'a' | 'b'
  settings: { ...SPORTS.pickleball.defaults },
  history: [],           // [{action, scoreA, scoreB, set, timestamp}]
  timerMs: 0,
  timerRunning: false,
  matchOver: false,
  startTime: null,       // ms timestamp when match began
});

let state = DEFAULT_STATE();
let timerInterval   = null;
let timerLastTick   = null;
let wakeLock        = null;
let soundEnabled    = true;
let currentSection  = 'scoreboard';
let editingPresetId = null;
let tournamentState = null;
let customSportsCache = [];

// Audio context (lazy init)
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/* =============================================
   SOUND EFFECTS (Web Audio API)
   ============================================= */
function playBeep(freq = 880, dur = 0.08, type = 'square') {
  if (!soundEnabled) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch(e) {}
}

function playScore()  { playBeep(660, 0.1, 'sine'); }
function playUndo()   { playBeep(330, 0.15, 'sine'); }
function playWin()    { [880,1100,1320].forEach((f,i) => setTimeout(() => playBeep(f, 0.2, 'sine'), i * 120)); }
function playReset()  { playBeep(220, 0.2, 'square'); }

/* =============================================
   CONFETTI
   ============================================= */
(function setupConfetti() {
  const canvas  = document.getElementById('confetti-canvas');
  const ctx     = canvas.getContext('2d');
  let particles = [];
  let animFrame = null;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: -20,
      r: Math.random() * 8 + 4,
      d: Math.random() * 360,
      color: `hsl(${Math.random()*360},90%,60%)`,
      tilt: Math.random() * 10 - 5,
      tiltSpeed: Math.random() * 0.1 + 0.05,
      speed: Math.random() * 3 + 2,
      drift: Math.random() * 2 - 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
      opacity: 1,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.d * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r/2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function update() {
    particles = particles.filter(p => p.opacity > 0.05 && p.y < canvas.height + 40);
    particles.forEach(p => {
      p.y       += p.speed;
      p.x       += p.drift;
      p.d       += p.tiltSpeed * 3;
      p.tilt    += p.tiltSpeed;
      p.opacity -= 0.004;
    });
  }

  function loop() {
    draw();
    update();
    if (particles.length > 0) animFrame = requestAnimationFrame(loop);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); animFrame = null; }
  }

  window.launchConfetti = function(count = 120) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => particles.push(createParticle()), Math.random() * 1200);
    }
    if (!animFrame) loop();
  };
})();

/* =============================================
   TOAST
   ============================================= */
window.showToast = function(msg, duration = 3000) {
  const container = document.getElementById('toast-container');
  const el        = document.createElement('div');
  el.className    = 'toast';
  el.textContent  = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
};

/* =============================================
   ACHIEVEMENT POPUP
   ============================================= */
window.addEventListener('achievement-unlocked', (e) => {
  const ach   = e.detail;
  const popup = document.getElementById('achievement-popup');
  document.getElementById('ach-icon').textContent = ach.icon;
  document.getElementById('ach-name').textContent = ach.name;
  popup.hidden = false;
  setTimeout(() => { popup.hidden = true; }, 4000);
  playBeep(1047, 0.3, 'sine');
});

/* =============================================
   WAKE LOCK
   ============================================= */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
  }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(()=>{}); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.timerRunning) requestWakeLock();
});

/* =============================================
   TIMER
   ============================================= */
function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  timerLastTick      = Date.now();
  if (!state.startTime) state.startTime = Date.now();
  timerInterval = setInterval(() => {
    const now  = Date.now();
    state.timerMs += now - timerLastTick;
    timerLastTick  = now;
    renderTimer();
  }, 200);
  renderTimer();
  requestWakeLock();
  document.getElementById('timer-start-pause').textContent = '⏸ Pause';
}

function pauseTimer() {
  if (!state.timerRunning) return;
  state.timerRunning = false;
  clearInterval(timerInterval);
  renderTimer();
  releaseWakeLock();
  document.getElementById('timer-start-pause').textContent = '▶ Start';
}

function resetTimer() {
  pauseTimer();
  state.timerMs  = 0;
  state.startTime = null;
  renderTimer();
}

function renderTimer() {
  const ms   = state.timerMs;
  const sec  = Math.floor(ms / 1000) % 60;
  const min  = Math.floor(ms / 60000);
  const disp = document.getElementById('timer-display');
  disp.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  disp.classList.toggle('running', state.timerRunning);
}

/* =============================================
   SCORE FUNCTIONS
   ============================================= */
function addScore(team, delta) {
  if (state.matchOver) return;

  // Clamp negatives
  if (team === 'a') {
    state.scoreA = Math.max(0, state.scoreA + delta);
  } else {
    state.scoreB = Math.max(0, state.scoreB + delta);
  }

  // Record history
  const entry = {
    action: delta < 0 ? 'minus' : 'score',
    team,
    delta,
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    set: state.currentSet,
    timestamp: Date.now(),
  };
  state.history.unshift(entry);

  // Start timer on first score
  if (!state.timerRunning && !state.matchOver && state.timerMs === 0) startTimer();

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(delta < 0 ? [30] : [40]);

  // Sound
  if (delta > 0) playScore();
  else           playUndo();

  // Serve rotation for pickleball/volleyball (simple: swap on point won)
  if (state.settings.serveTracking && delta > 0) {
    state.serving = team;
  }

  // Check win condition
  checkWin();

  // Auto-save
  Accounts.autosave(getGameSnapshot());

  // Render
  renderScoreboard();
}

function undoLast() {
  if (state.history.length === 0) return;
  const last = state.history.shift();
  if (last.team === 'a') state.scoreA = last.delta < 0 ? Math.min(state.scoreA + 1, last.scoreA + 1) : Math.max(0, state.scoreA - last.delta);
  else                   state.scoreB = last.delta < 0 ? Math.min(state.scoreB + 1, last.scoreB + 1) : Math.max(0, state.scoreB - last.delta);
  // Restore exact snapshot
  state.scoreA = Math.max(0, last.scoreA - last.delta);
  state.scoreB = Math.max(0, last.scoreB - last.delta);
  if (last.team === 'a') state.scoreA = Math.max(0, last.scoreA - (last.delta > 0 ? last.delta : 0) + (last.delta < 0 ? Math.abs(last.delta) : 0));
  // Simpler: just roll back to pre-action scores
  state.scoreA = last.scoreA - (last.team === 'a' ? last.delta : 0);
  state.scoreB = last.scoreB - (last.team === 'b' ? last.delta : 0);
  state.scoreA = Math.max(0, state.scoreA);
  state.scoreB = Math.max(0, state.scoreB);

  playUndo();
  Accounts.autosave(getGameSnapshot());
  renderScoreboard();
}

function checkWin() {
  const { winScore, winByTwo, sets } = state.settings;
  if (!winScore || winScore <= 0) return; // Free-form sport

  const a = state.scoreA, b = state.scoreB;
  const diff = Math.abs(a - b);
  const setWon = (score, other) =>
    score >= winScore && (!winByTwo || score - other >= 2);

  let winner = null;
  if (setWon(a, b)) winner = 'a';
  else if (setWon(b, a)) winner = 'b';

  if (winner) {
    if (sets > 1) {
      // Multi-set logic
      state.setScores.push({ a: state.scoreA, b: state.scoreB });
      if (winner === 'a') state.setsA++;
      else                state.setsB++;

      const setsNeeded = Math.ceil(sets / 2);
      if (state.setsA >= setsNeeded || state.setsB >= setsNeeded) {
        endMatch(state.setsA >= setsNeeded ? 'a' : 'b');
      } else {
        // Next set
        state.currentSet++;
        state.scoreA = 0;
        state.scoreB = 0;
        // Side switch on set win for some sports
        if (state.settings.sideSwitching) showSideSwitch();
        renderScoreboard();
      }
    } else {
      endMatch(winner);
    }
  }

  // Show match-point badge
  renderMatchPointBadge();
}

function renderMatchPointBadge() {
  const { winScore, winByTwo, sets } = state.settings;
  if (!winScore || winScore <= 0) { document.getElementById('match-point-badge').hidden = true; return; }

  const a = state.scoreA, b = state.scoreB;
  const setsNeeded = Math.ceil(sets / 2);
  const matchPointA = (state.setsA === setsNeeded - 1 || sets === 1) &&
    (a >= winScore - 1) && (!winByTwo || a >= b);
  const matchPointB = (state.setsB === setsNeeded - 1 || sets === 1) &&
    (b >= winScore - 1) && (!winByTwo || b >= a);

  const badge = document.getElementById('match-point-badge');
  badge.hidden = !(matchPointA || matchPointB);

  document.getElementById('team-a-card').classList.toggle('match-point-a', matchPointA);
  document.getElementById('team-b-card').classList.toggle('match-point-b', matchPointB);
}

function showSideSwitch() {
  const banner = document.getElementById('side-switch-banner');
  banner.hidden = false;
  setTimeout(() => { banner.hidden = true; }, 4000);
}

function endMatch(winner) {
  state.matchOver = true;
  pauseTimer();
  releaseWakeLock();
  playWin();
  launchConfetti(160);

  // Record to account
  Accounts.recordMatch({
    sport: state.sport,
    winner,
    teamA: state.teamA,
    teamB: state.teamB,
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    durationMs: state.timerMs,
  });

  Accounts.clearAutosave();

  // Show win screen
  const winnerName = winner === 'a' ? state.teamA : state.teamB;
  document.getElementById('win-winner-name').textContent = `🏆 ${winnerName} Wins!`;
  document.getElementById('win-final-score').textContent =
    state.settings.sets > 1
      ? `${state.setsA} – ${state.setsB} sets`
      : `${state.scoreA} – ${state.scoreB}`;
  const mins = Math.floor(state.timerMs / 60000);
  const secs = Math.floor(state.timerMs / 1000) % 60;
  document.getElementById('win-duration').textContent =
    state.timerMs > 0 ? `Duration: ${mins}m ${secs}s` : '';

  const histHTML = state.history.slice(0, 10).map(h =>
    `<div>${h.team === 'a' ? state.teamA : state.teamB} +${h.delta} → ${h.scoreA}:${h.scoreB}</div>`
  ).join('');
  document.getElementById('win-history-list').innerHTML = histHTML || 'No history recorded.';
  document.getElementById('win-screen').hidden = false;
}

function resetMatch() {
  pauseTimer();
  releaseWakeLock();
  const sport = state.sport;
  const settings = { ...state.settings };
  const teamA = state.teamA;
  const teamB = state.teamB;
  state = DEFAULT_STATE();
  state.sport = sport;
  state.settings = settings;
  state.teamA = teamA;
  state.teamB = teamB;
  Accounts.clearAutosave();
  playReset();
  renderScoreboard();
  renderSportTabs();
}

/* =============================================
   GAME SNAPSHOT (for saves)
   ============================================= */
function getGameSnapshot() {
  return {
    sport: state.sport,
    teamA: state.teamA,
    teamB: state.teamB,
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    setsA: state.setsA,
    setsB: state.setsB,
    setScores: state.setScores,
    currentSet: state.currentSet,
    serving: state.serving,
    settings: state.settings,
    history: state.history.slice(0, 50),
    timerMs: state.timerMs,
    matchOver: state.matchOver,
    startTime: state.startTime,
    displayName: `${state.teamA} vs ${state.teamB}`,
    sportLabel: SPORTS[state.sport]?.label || state.sport,
  };
}

function restoreSnapshot(snap) {
  Object.assign(state, snap);
  renderScoreboard();
  renderSportTabs();
  showToast('Game loaded!');
}

/* =============================================
   RENDER SCOREBOARD
   ============================================= */
function renderScoreboard() {
  const sport = SPORTS[state.sport] || { label: state.sport, icon: '🎮' };

  // Sport badge
  document.getElementById('match-sport-badge').textContent = `${sport.icon} ${sport.label}`;

  // Format badge
  const s = state.settings;
  const formatParts = [];
  if (s.winScore > 0) formatParts.push(`Race to ${s.winScore}`);
  if (s.winByTwo)     formatParts.push('Win by 2');
  if (s.sets > 1)     formatParts.push(`Best of ${s.sets}`);
  document.getElementById('match-format-badge').textContent = formatParts.join(' · ') || 'Free Play';

  // Scores
  updateScoreDisplay('a', state.scoreA);
  updateScoreDisplay('b', state.scoreB);

  // Team names
  document.getElementById('team-a-name').textContent = state.teamA;
  document.getElementById('team-b-name').textContent = state.teamB;

  // Serve indicators
  document.getElementById('serve-a').classList.toggle('active', state.serving === 'a' && s.serveTracking);
  document.getElementById('serve-b').classList.toggle('active', state.serving === 'b' && s.serveTracking);
  document.getElementById('team-a-card').classList.toggle('serving', state.serving === 'a' && s.serveTracking);
  document.getElementById('team-b-card').classList.toggle('serving', state.serving === 'b' && s.serveTracking);

  // Score buttons (show +2/+3 based on increments)
  const incs = s.scoreIncrements || [1];
  document.getElementById('plus2-a').hidden = !incs.includes(2);
  document.getElementById('plus2-b').hidden = !incs.includes(2);
  document.getElementById('plus3-a').hidden = !incs.includes(3);
  document.getElementById('plus3-b').hidden = !incs.includes(3);

  // +1 button text
  document.querySelectorAll('.score-plus').forEach(btn => { btn.textContent = '+1'; });

  // Sets tracker
  renderSetsTracker();

  // History
  renderHistory();

  // Match point
  renderMatchPointBadge();
}

function updateScoreDisplay(team, score) {
  const el = document.getElementById(`score-${team}`);
  const prev = parseInt(el.textContent) || 0;
  el.textContent = score;
  if (score !== prev) {
    el.classList.remove('bump');
    void el.offsetWidth; // reflow
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 350);
  }
}

function renderSetsTracker() {
  const tracker = document.getElementById('sets-tracker');
  const { sets } = state.settings;
  if (!sets || sets <= 1) { tracker.hidden = true; return; }

  tracker.hidden = false;
  tracker.innerHTML = '';

  for (let i = 0; i < sets; i++) {
    const setData = state.setScores[i];
    const div     = document.createElement('div');
    div.className = 'set-indicator';

    if (i < state.setScores.length && setData) {
      const wonA = setData.a > setData.b;
      div.classList.add(wonA ? 'won-a' : 'won-b');
      div.innerHTML = `<span class="set-num">Set ${i+1}</span><span class="set-score">${setData.a}–${setData.b}</span>`;
    } else if (i === state.currentSet - 1) {
      div.classList.add('current');
      div.innerHTML = `<span class="set-num">Set ${i+1}</span><span class="set-score">${state.scoreA}–${state.scoreB}</span>`;
    } else {
      div.innerHTML = `<span class="set-num">Set ${i+1}</span><span class="set-score">–</span>`;
    }

    tracker.appendChild(div);
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (state.history.length === 0) {
    list.innerHTML = '<li class="history-empty">No actions yet. Start scoring!</li>';
    return;
  }
  list.innerHTML = state.history.slice(0, 30).map((h, i) => {
    const teamName = h.team === 'a' ? state.teamA : state.teamB;
    const dotClass = h.team === 'a' ? 'team-a' : 'team-b';
    const timeStr  = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<li class="history-item">
      <span class="history-dot ${dotClass}"></span>
      <span class="history-text">${teamName} ${h.delta > 0 ? '+' : ''}${h.delta} (Set ${h.set})</span>
      <span class="history-score">${h.scoreA}–${h.scoreB}</span>
      <span class="history-time">${timeStr}</span>
    </li>`;
  }).join('');
}

/* =============================================
   SPORT TABS
   ============================================= */
async function renderSportTabs() {
  const container = document.getElementById('sport-scroll');
  container.innerHTML = '';
  customSportsCache = await Accounts.getCustomSports().catch(() => []);

  const allSports = [
    ...Object.values(SPORTS),
    ...customSportsCache.map(s => ({ id: `custom_${s.id}`, label: s.name, icon: s.icon || '🎮', isCustom: true, raw: s })),
  ];

  allSports.forEach(sport => {
    const btn = document.createElement('button');
    btn.className = `sport-tab${state.sport === sport.id ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', state.sport === sport.id);
    btn.innerHTML = `<span>${sport.icon}</span>${sport.label}`;
    btn.addEventListener('click', () => switchSport(sport.id, sport.isCustom ? sport.raw : null));
    container.appendChild(btn);
  });
}

function switchSport(sportId, customData = null) {
  state.sport = sportId;
  if (customData) {
    state.settings = { ...SPORTS.pickleball.defaults, ...customData };
  } else {
    const def = SPORTS[sportId]?.defaults || SPORTS.pickleball.defaults;
    state.settings = { ...def };
  }
  renderSportTabs();
  renderScoreboard();
}

/* =============================================
   SETTINGS PANEL
   ============================================= */
function openSettings() {
  const panel = document.getElementById('settings-panel');
  const body  = document.getElementById('settings-body');
  const sport = SPORTS[state.sport] || {};
  const s     = state.settings;

  body.innerHTML = `
    <div class="form-group">
      <label>Team A Name</label>
      <input type="text" id="set-team-a" value="${escHtml(state.teamA)}" maxlength="20" />
    </div>
    <div class="form-group">
      <label>Team B Name</label>
      <input type="text" id="set-team-b" value="${escHtml(state.teamB)}" maxlength="20" />
    </div>
    <div class="form-group">
      <label>Points to Win (0 = free play)</label>
      <input type="number" id="set-win-score" value="${s.winScore}" min="0" max="999" />
    </div>
    <div class="form-group">
      <label>Win by 2</label>
      <label class="toggle-switch">
        <input type="checkbox" id="set-win-by-two" ${s.winByTwo ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="form-group">
      <label>Number of Sets</label>
      <input type="number" id="set-sets" value="${s.sets}" min="1" max="9" />
    </div>
    <div class="form-group">
      <label>Score Increments</label>
      <div class="check-group">
        <label><input type="checkbox" class="inc-check" value="1" ${s.scoreIncrements?.includes(1) ? 'checked' : ''} /> +1</label>
        <label><input type="checkbox" class="inc-check" value="2" ${s.scoreIncrements?.includes(2) ? 'checked' : ''} /> +2</label>
        <label><input type="checkbox" class="inc-check" value="3" ${s.scoreIncrements?.includes(3) ? 'checked' : ''} /> +3</label>
      </div>
    </div>
    <div class="form-group">
      <label>Serve Tracking</label>
      <label class="toggle-switch">
        <input type="checkbox" id="set-serve" ${s.serveTracking ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="form-group">
      <label>Side Switching</label>
      <label class="toggle-switch">
        <input type="checkbox" id="set-side" ${s.sideSwitching ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="form-group">
      <label>First Serve</label>
      <div class="btn-group">
        <button class="btn btn-ghost btn-sm serve-init-btn ${state.serving === 'a' ? 'active' : ''}" data-serve="a">Team A</button>
        <button class="btn btn-ghost btn-sm serve-init-btn ${state.serving === 'b' ? 'active' : ''}" data-serve="b">Team B</button>
      </div>
    </div>
  `;

  // Serve button toggle
  body.querySelectorAll('.serve-init-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.serve-init-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  panel.hidden = false;
}

function applySettings() {
  state.teamA = document.getElementById('set-team-a').value.trim() || 'Team A';
  state.teamB = document.getElementById('set-team-b').value.trim() || 'Team B';

  const winScore = parseInt(document.getElementById('set-win-score').value) || 0;
  const winByTwo = document.getElementById('set-win-by-two').checked;
  const sets     = parseInt(document.getElementById('set-sets').value) || 1;
  const serveTracking  = document.getElementById('set-serve').checked;
  const sideSwitching  = document.getElementById('set-side').checked;

  const incs = [...document.querySelectorAll('.inc-check:checked')].map(c => parseInt(c.value));
  const serving = document.querySelector('.serve-init-btn.active')?.dataset.serve || state.serving;

  state.settings = { winScore, winByTwo, sets, serveTracking, sideSwitching, scoreIncrements: incs.length ? incs : [1] };
  state.serving  = serving;

  document.getElementById('settings-panel').hidden = true;
  renderScoreboard();
  showToast('Settings applied!');
}

/* =============================================
   SHARE MATCH RESULT
   ============================================= */
async function shareResult() {
  const sport = SPORTS[state.sport]?.label || state.sport;
  const text  = [
    `🏟 ScoreKeep Pro — ${sport} Match`,
    `${state.teamA} ${state.scoreA} – ${state.scoreB} ${state.teamB}`,
    state.timerMs > 0 ? `Duration: ${Math.floor(state.timerMs/60000)}m ${Math.floor(state.timerMs/1000)%60}s` : '',
    `\nScored with ScoreKeep Pro`,
  ].filter(Boolean).join('\n');

  if (navigator.share) {
    try { await navigator.share({ title: 'Match Result', text }); return; }
    catch(e) {}
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    showToast('Result copied to clipboard!');
  } catch(e) {
    showToast('Could not share. Try copying manually.');
  }
}

/* =============================================
   SAVE SLOTS UI
   ============================================= */
async function renderSavesSection() {
  const container = document.getElementById('saves-list');
  const slots     = await Accounts.getSaveSlots();

  // Build slot map
  const slotMap = {};
  slots.forEach(s => { slotMap[s.slotNumber] = s; });

  container.innerHTML = '';
  for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
    const slot = slotMap[i];
    const card = document.createElement('div');
    card.className = `save-slot-card${slot ? '' : ' save-slot-empty'}`;

    if (slot) {
      const date = new Date(slot.savedAt).toLocaleDateString();
      const time = new Date(slot.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="save-slot-num">${i}</div>
        <div class="save-slot-info">
          <div class="save-slot-name">${escHtml(slot.displayName || slot.sportLabel)}</div>
          <div class="save-slot-score">${slot.scoreA} – ${slot.scoreB}</div>
          <div class="save-slot-meta">${slot.sportLabel} · Saved ${date} ${time}</div>
        </div>
        <div class="save-slot-actions">
          <button class="btn btn-accent btn-sm" data-load="${i}">Load</button>
          <button class="btn btn-ghost btn-sm" data-save="${i}">Overwrite</button>
          <button class="btn btn-danger btn-sm" data-delete="${i}">🗑</button>
        </div>
      `;
      card.querySelector('[data-load]').addEventListener('click', () => loadSave(slot));
      card.querySelector('[data-save]').addEventListener('click', () => saveToSlot(i));
      card.querySelector('[data-delete]').addEventListener('click', async () => {
        await Accounts.deleteSave(i);
        renderSavesSection();
      });
    } else {
      card.innerHTML = `
        <div class="save-slot-num">${i}</div>
        <div class="save-slot-info">
          <div class="save-slot-name" style="color:var(--text-muted)">Empty Slot</div>
        </div>
        <div class="save-slot-actions">
          <button class="btn btn-ghost btn-sm" data-save="${i}">Save Here</button>
        </div>
      `;
      card.querySelector('[data-save]').addEventListener('click', () => saveToSlot(i));
      card.addEventListener('click', (e) => { if (!e.target.closest('button')) saveToSlot(i); });
    }

    container.appendChild(card);
  }
}

async function saveToSlot(num) {
  const snap = getGameSnapshot();
  await Accounts.saveGame(num, snap);
  showToast(`Game saved to slot ${num}!`);
  renderSavesSection();
}

function loadSave(slot) {
  restoreSnapshot(slot);
  switchSection('scoreboard');
}

/* =============================================
   PRESETS SECTION
   ============================================= */
async function renderPresetsSection() {
  const container = document.getElementById('presets-list');
  const presets   = await Accounts.getPresets();

  if (presets.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚙️</div><div class="empty-text">No presets yet.</div></div>';
    return;
  }

  container.innerHTML = '';
  presets.forEach(preset => {
    const sport = SPORTS[preset.sport] || { icon: '🎮' };
    const card  = document.createElement('div');
    card.className = `preset-card${preset.isDefault ? ' default-preset' : ''}`;
    const tagsHtml = (preset.tags || []).map(t => `<span class="preset-tag">${escHtml(t)}</span>`).join('');
    card.innerHTML = `
      <div class="preset-sport-icon">${sport.icon}</div>
      <div class="preset-info">
        <div class="preset-name">${escHtml(preset.name)}</div>
        <div class="preset-sport">${SPORTS[preset.sport]?.label || preset.sport}</div>
        <div class="preset-tags">${tagsHtml}</div>
      </div>
      <div class="preset-actions">
        <button class="btn btn-accent btn-sm" data-apply>Apply</button>
        ${!preset.isDefault ? `<button class="btn btn-ghost btn-sm" data-edit>Edit</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-export>Export</button>
        ${!preset.isDefault ? `<button class="btn btn-danger btn-sm" data-del>🗑</button>` : ''}
      </div>
    `;

    card.querySelector('[data-apply]')?.addEventListener('click', () => applyPreset(preset));
    card.querySelector('[data-edit]')?.addEventListener('click',  () => openPresetModal(preset));
    card.querySelector('[data-export]')?.addEventListener('click',() => exportJSON(preset, `preset_${preset.name}.json`));
    card.querySelector('[data-del]')?.addEventListener('click',   async () => {
      await Accounts.deletePreset(preset.id);
      renderPresetsSection();
    });

    container.appendChild(card);
  });
}

function applyPreset(preset) {
  state.sport    = preset.sport;
  state.settings = { ...SPORTS[preset.sport]?.defaults, ...preset.settings };
  renderSportTabs();
  renderScoreboard();
  switchSection('scoreboard');
  showToast(`Preset "${preset.name}" applied!`);
}

function openPresetModal(preset = null) {
  editingPresetId = preset?.id || null;
  const modal = document.getElementById('preset-modal');
  const sportSel = document.getElementById('pm-sport');

  // Populate sport selector
  sportSel.innerHTML = Object.values(SPORTS).map(s =>
    `<option value="${s.id}" ${preset?.sport === s.id ? 'selected' : ''}>${s.icon} ${s.label}</option>`
  ).join('');

  document.getElementById('pm-name').value  = preset?.name || '';
  document.getElementById('pm-tags').value  = (preset?.tags || []).join(', ');
  document.getElementById('pm-title').textContent = preset ? 'Edit Preset' : 'New Preset';
  modal.hidden = false;
}

async function savePreset() {
  const name  = document.getElementById('pm-name').value.trim();
  const sport = document.getElementById('pm-sport').value;
  const tags  = document.getElementById('pm-tags').value.split(',').map(t => t.trim()).filter(Boolean);

  if (!name) { showToast('Preset name required.'); return; }

  const preset = {
    id: editingPresetId || undefined,
    name,
    sport,
    tags,
    settings: { ...SPORTS[sport]?.defaults },
  };

  await Accounts.savePreset(preset);
  document.getElementById('preset-modal').hidden = true;
  renderPresetsSection();
  showToast('Preset saved!');
}

/* =============================================
   CUSTOM SPORTS SECTION
   ============================================= */
async function renderCustomSportsSection() {
  const container = document.getElementById('custom-sports-list');
  const sports    = await Accounts.getCustomSports();

  if (sports.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎨</div><div class="empty-text">No custom sports yet. Create one!</div></div>';
    return;
  }

  container.innerHTML = '';
  sports.forEach(sport => {
    const card = document.createElement('div');
    card.className = 'custom-sport-card';
    const tagsHtml = (sport.tags || []).map(t => `<span class="cs-tag">${escHtml(t)}</span>`).join('');
    card.innerHTML = `
      <div class="cs-icon">${sport.icon || '🎮'}</div>
      <div class="cs-info">
        <div class="cs-name">${escHtml(sport.name)}</div>
        <div class="cs-rules">To ${sport.winScore || '?'} pts · ${sport.sets || 1} set(s) · Win by ${sport.winByTwo ? '2' : '1'}</div>
        <div class="cs-tags">${tagsHtml}</div>
      </div>
      <div class="cs-actions">
        <button class="btn btn-accent btn-sm" data-play>Play</button>
        <button class="btn btn-ghost btn-sm" data-export>Export</button>
        <button class="btn btn-danger btn-sm" data-del>🗑</button>
      </div>
    `;

    card.querySelector('[data-play]').addEventListener('click', () => {
      switchSport(`custom_${sport.id}`, sport);
      switchSection('scoreboard');
    });
    card.querySelector('[data-export]').addEventListener('click', () => exportJSON(sport, `sport_${sport.name}.json`));
    card.querySelector('[data-del]').addEventListener('click', async () => {
      await Accounts.deleteCustomSport(sport.id);
      renderCustomSportsSection();
      renderSportTabs();
    });

    container.appendChild(card);
  });
}

function openCustomSportModal() {
  document.getElementById('custom-sport-modal').hidden = false;
  document.getElementById('cs-name').value  = '';
  document.getElementById('cs-icon').value  = '🎯';
  document.getElementById('cs-win-score').value = '21';
  document.getElementById('cs-win-by-two').checked = true;
  document.getElementById('cs-sets').value  = '1';
  document.getElementById('cs-serve-track').checked = false;
  document.getElementById('cs-side-switch').checked  = false;
  document.getElementById('cs-notes').value = '';
  document.getElementById('cs-tags').value  = '';
}

async function saveCustomSport() {
  const name = document.getElementById('cs-name').value.trim();
  if (!name) { showToast('Sport name required.'); return; }

  const incs = [...document.querySelectorAll('.cs-inc:checked')].map(c => parseInt(c.value));
  const sport = {
    name,
    icon: document.getElementById('cs-icon').value || '🎮',
    winScore: parseInt(document.getElementById('cs-win-score').value) || 21,
    winByTwo: document.getElementById('cs-win-by-two').checked,
    sets: parseInt(document.getElementById('cs-sets').value) || 1,
    scoreIncrements: incs.length ? incs : [1],
    serveTracking: document.getElementById('cs-serve-track').checked,
    sideSwitching: document.getElementById('cs-side-switch').checked,
    notes: document.getElementById('cs-notes').value.trim(),
    tags: document.getElementById('cs-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
  };

  await Accounts.saveCustomSport(sport);
  document.getElementById('custom-sport-modal').hidden = true;
  renderCustomSportsSection();
  renderSportTabs();
  showToast(`Custom sport "${name}" created!`);
}

/* =============================================
   DASHBOARD / CHARTS
   ============================================= */
async function renderDashboard() {
  const profile = Accounts.getCurrentProfile();
  const stats   = profile.stats || {};

  // Profile mini
  document.getElementById('dashboard-profile-mini').innerHTML =
    `<span style="font-size:1.4rem">${profile.avatar}</span> <strong>${escHtml(profile.displayName)}</strong>`;

  // Stat cards
  document.getElementById('stat-total').textContent    = stats.totalMatches || 0;
  document.getElementById('stat-wins').textContent     = stats.totalWins || 0;
  const wr = stats.totalMatches ? Math.round((stats.totalWins / stats.totalMatches) * 100) : 0;
  document.getElementById('stat-winrate').textContent  = `${wr}%`;
  document.getElementById('stat-streak').textContent   = stats.longestStreak || 0;
  const avgMs = stats.totalMatches ? Math.floor((stats.totalDurationMs || 0) / stats.totalMatches / 60000) : 0;
  document.getElementById('stat-avg-duration').textContent = `${avgMs}m`;
  const favSport = Object.entries(stats.sportPlayed || {}).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('stat-favorite').textContent = favSport ? (SPORTS[favSport[0]]?.icon + ' ' + SPORTS[favSport[0]]?.label || favSport[0]) : '—';

  // Charts
  renderWinsBySportChart(stats);
  renderRecentActivityChart(stats);

  // Achievements
  renderAchievementsGrid(profile);

  // Recent matches
  const history = await Accounts.getMatchHistory(20);
  renderRecentMatches(history);
}

function renderWinsBySportChart(stats) {
  const canvas = document.getElementById('chart-wins-by-sport');
  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth * devicePixelRatio;
  canvas.height = 220 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const W = canvas.offsetWidth, H = 220;

  ctx.clearRect(0, 0, W, H);

  const sportWins = stats.sportWins || {};
  const entries   = Object.entries(sportWins);
  if (entries.length === 0) {
    drawEmptyChart(ctx, W, H, 'No match data yet');
    return;
  }

  const maxVal  = Math.max(...entries.map(e => e[1]), 1);
  const barW    = Math.min(60, (W - 40) / entries.length - 12);
  const padB    = 40, padT = 20;
  const chartH  = H - padB - padT;
  const colors  = ['#e94560','#00d4ff','#2ecc71','#f39c12','#9b59b6','#e67e22'];

  entries.forEach(([sport, wins], i) => {
    const x    = 20 + i * (barW + 12);
    const barH = (wins / maxVal) * chartH;
    const y    = padT + chartH - barH;
    const color = colors[i % colors.length];

    // Bar
    ctx.fillStyle = color + '40';
    ctx.fillRect(x, padT, barW, chartH);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, barH);

    // Label
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#aaa';
    ctx.font      = '11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(SPORTS[sport]?.icon || sport.slice(0,3), x + barW/2, H - 22);
    ctx.fillText(wins, x + barW/2, y - 6);
  });
}

function renderRecentActivityChart(stats) {
  const canvas  = document.getElementById('chart-recent-activity');
  const ctx     = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth * devicePixelRatio;
  canvas.height = 220 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const W = canvas.offsetWidth, H = 220;

  ctx.clearRect(0, 0, W, H);

  const results = (stats.recentResults || []).slice(0, 20).reverse();
  if (results.length === 0) {
    drawEmptyChart(ctx, W, H, 'No recent matches');
    return;
  }

  const dotR  = 8;
  const padH  = 30, padV = 30;
  const chartW = W - 2 * padH;
  const step   = chartW / Math.max(results.length - 1, 1);

  // Win/loss cumulative line
  let cum = 0;
  const points = results.map((r, i) => {
    if (r === 'W') cum++;
    else if (r === 'L') cum--;
    return { x: padH + i * step, y: H/2 - cum * 8, r };
  });

  // Draw area
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(233,69,96,0.3)');
  grad.addColorStop(1, 'rgba(233,69,96,0)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, H/2);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length-1].x, H/2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth   = 2;
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI*2);
    ctx.fillStyle = p.r === 'W' ? '#2ecc71' : p.r === 'L' ? '#e74c3c' : '#aaa';
    ctx.fill();
  });

  // Baseline
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.moveTo(padH, H/2);
  ctx.lineTo(W - padH, H/2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEmptyChart(ctx, W, H, msg) {
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font      = '14px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W/2, H/2);
}

function renderAchievementsGrid(profile) {
  const grid   = document.getElementById('achievements-grid');
  const earned = new Set(profile.earnedAchievements || []);

  grid.innerHTML = ACHIEVEMENTS.map(ach => `
    <div class="achievement-badge ${earned.has(ach.id) ? 'earned' : 'locked'}" title="${ach.desc}">
      <div class="ach-badge-icon">${ach.icon}</div>
      <div class="ach-badge-name">${ach.name}</div>
      <div class="ach-badge-desc">${ach.desc}</div>
    </div>
  `).join('');
}

function renderRecentMatches(history) {
  const container = document.getElementById('recent-matches-list');
  if (!history.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏟</div><div class="empty-text">No matches yet. Start playing!</div></div>';
    return;
  }
  container.innerHTML = history.map(m => {
    const sport = SPORTS[m.sport] || { icon: '🎮', label: m.sport };
    const date  = new Date(m.timestamp).toLocaleDateString();
    const result = m.winner === 'a' ? 'win' : m.winner === 'b' ? 'loss' : 'draw';
    const label  = m.winner === 'a' ? 'W' : m.winner === 'b' ? 'L' : 'D';
    return `
      <div class="recent-match-item">
        <div class="rm-sport">${sport.icon}</div>
        <div class="rm-info">
          <div class="rm-teams">${escHtml(m.teamA)} vs ${escHtml(m.teamB)}</div>
          <div class="rm-score">${m.scoreA} – ${m.scoreB}</div>
          <div class="rm-meta">${sport.label} · ${date}</div>
        </div>
        <div class="rm-result ${result}">${label}</div>
      </div>
    `;
  }).join('');
}

/* =============================================
   PROFILE SECTION
   ============================================= */
function renderProfileEdit() {
  const profile = Accounts.getCurrentProfile();
  document.getElementById('edit-display-name').value = profile.displayName || '';
  document.getElementById('edit-username').value     = profile.username || '';
  document.getElementById('edit-accent-color').value = profile.accentColor || '#e94560';
  document.getElementById('avatar-preview').innerHTML = profile.avatarImage
    ? `<img src="${profile.avatarImage}" alt="avatar" />`
    : profile.avatar || '😊';

  // Default sport
  const sportSel = document.getElementById('edit-default-sport');
  sportSel.innerHTML = Object.values(SPORTS).map(s =>
    `<option value="${s.id}" ${profile.defaultSport === s.id ? 'selected' : ''}>${s.icon} ${s.label}</option>`
  ).join('');

  // Theme pref
  document.querySelectorAll('.pref-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themePref === (profile.themePref || 'dark'));
  });

  // Avatar picker
  const picker = document.getElementById('avatar-picker');
  picker.innerHTML = AVATAR_EMOJIS.map(em =>
    `<button class="avatar-emoji-btn${profile.avatar === em ? ' selected' : ''}" data-emoji="${em}" aria-label="${em}">${em}</button>`
  ).join('');
  picker.querySelectorAll('.avatar-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.avatar-emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('avatar-preview').textContent = btn.dataset.emoji;
    });
  });
}

async function saveProfileChanges() {
  const displayName = document.getElementById('edit-display-name').value.trim();
  const username    = document.getElementById('edit-username').value.trim();
  const accentColor = document.getElementById('edit-accent-color').value;
  const defaultSport = document.getElementById('edit-default-sport').value;
  const newPassword = document.getElementById('edit-new-password').value;
  const themePref   = document.querySelector('.pref-theme-btn.active')?.dataset.themePref || 'dark';
  const avatar      = document.querySelector('.avatar-emoji-btn.selected')?.dataset.emoji ||
                      Accounts.getCurrentProfile().avatar;

  const updates = { displayName, username, accentColor, defaultSport, themePref, avatar };
  if (newPassword) updates.newPassword = newPassword;

  const result = await Accounts.updateProfile(updates);
  if (!result.ok) {
    document.getElementById('profile-edit-error').textContent = result.msg;
    if (result.field === 'username') document.getElementById('edit-username-err').textContent = result.msg;
    return;
  }

  document.getElementById('edit-new-password').value = '';
  document.getElementById('profile-edit-error').textContent = '';

  // Apply accent color
  document.documentElement.style.setProperty('--accent', accentColor);
  // Apply theme
  document.documentElement.setAttribute('data-theme', themePref);

  updateNavProfile();
  showToast('Profile saved!');
}

function renderProfileSwitch() {
  const container = document.getElementById('profile-list');
  const profiles  = Accounts.getAllProfiles().filter(p => !p.isGuest);
  const current   = Accounts.getCurrentProfile();

  if (profiles.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">No accounts yet. Create one!</div></div>';
    return;
  }

  container.innerHTML = profiles.map(p => `
    <div class="profile-card${p.id === current.id ? ' active' : ''}" data-pid="${p.id}">
      <div class="profile-card-avatar">${p.avatar || '😊'}</div>
      <div class="profile-card-name">${escHtml(p.displayName)}</div>
      <div class="profile-card-username">@${escHtml(p.username)}</div>
      ${p.id === current.id ? '<div style="color:var(--accent);font-size:0.78rem;font-weight:700">Active</div>' : ''}
    </div>
  `).join('');

  container.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => {
      Accounts.switchProfile(card.dataset.pid);
      updateNavProfile();
      renderProfileSwitch();
      showToast('Profile switched!');
    });
  });
}

function updateNavProfile() {
  const profile = Accounts.getCurrentProfile();
  const emojiOrImg = profile.avatarImage
    ? `<img src="${profile.avatarImage}" alt="avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" />`
    : profile.avatar;
  document.getElementById('profile-avatar-nav').innerHTML    = emojiOrImg;
  document.getElementById('profile-avatar-bottom').innerHTML = emojiOrImg;
  document.getElementById('drawer-avatar').innerHTML         = emojiOrImg;
  document.getElementById('drawer-display-name').textContent = profile.displayName;
  document.getElementById('drawer-username').textContent     = `@${profile.username}`;
}

/* =============================================
   TOURNAMENT BRACKET
   ============================================= */
let bracketSize   = 4;
let bracketWinners = {};

function setupTournamentUI() {
  const inputContainer = document.getElementById('team-name-inputs');

  function rebuildInputs(size) {
    inputContainer.innerHTML = '';
    for (let i = 0; i < size; i++) {
      const inp = document.createElement('input');
      inp.type  = 'text';
      inp.placeholder = `Team ${i + 1}`;
      inp.value = tournamentState?.teams?.[i] || `Team ${i+1}`;
      inp.id    = `t-team-${i}`;
      inputContainer.appendChild(inp);
    }
  }

  rebuildInputs(bracketSize);

  document.querySelectorAll('.bracket-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bracket-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bracketSize = parseInt(btn.dataset.size);
      rebuildInputs(bracketSize);
    });
  });

  document.getElementById('generate-bracket-btn').addEventListener('click', generateBracket);
}

function generateBracket() {
  const teams = [];
  for (let i = 0; i < bracketSize; i++) {
    teams.push(document.getElementById(`t-team-${i}`)?.value.trim() || `Team ${i+1}`);
  }
  const name = document.getElementById('tournament-name').value.trim() || 'Tournament';

  tournamentState = { name, teams, rounds: buildRounds(teams), bracketWinners: {} };
  bracketWinners  = {};
  renderBracket();
  document.getElementById('tournament-setup').style.display  = 'none';
  document.getElementById('bracket-container').hidden = false;
  Accounts.saveTournament(tournamentState).catch(() => {});
}

function buildRounds(teams) {
  // Pad to power of 2
  const size = teams.length;
  const rounds = [];
  let current = [...teams];
  while (current.length > 1) {
    const round = [];
    for (let i = 0; i < current.length; i += 2) {
      round.push({ teamA: current[i] || 'BYE', teamB: current[i+1] || 'BYE', winner: null });
    }
    rounds.push(round);
    current = round.map(() => '?'); // placeholders
  }
  return rounds;
}

function renderBracket() {
  const container = document.getElementById('bracket-container');
  if (!tournamentState) return;

  const { rounds } = tournamentState;
  container.innerHTML = '';

  const bracket = document.createElement('div');
  bracket.className = 'bracket';

  rounds.forEach((round, ri) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'bracket-round';

    const title = document.createElement('div');
    title.className = 'bracket-round-title';
    const roundNames = ['Round 1', 'Quarterfinals', 'Semifinals', 'Final', 'Champion'];
    title.textContent = roundNames[ri] || `Round ${ri+1}`;
    roundDiv.appendChild(title);

    round.forEach((match, mi) => {
      const matchDiv = document.createElement('div');
      matchDiv.className = 'bracket-match';

      const teams = [
        { name: match.teamA, side: 'a' },
        { name: match.teamB, side: 'b' },
      ];

      const key = `${ri}_${mi}`;

      teams.forEach(({ name, side }) => {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'bracket-team';
        teamDiv.textContent = name;

        if (match.winner === name) teamDiv.classList.add('winner');
        else if (match.winner && match.winner !== name) teamDiv.classList.add('loser');

        if (name !== 'BYE' && name !== '?') {
          teamDiv.addEventListener('click', () => {
            match.winner = name;
            // Propagate to next round
            if (ri + 1 < rounds.length) {
              const nextMatchIdx = Math.floor(mi / 2);
              const nextSlot = mi % 2 === 0 ? 'teamA' : 'teamB';
              rounds[ri + 1][nextMatchIdx][nextSlot] = name;
            }
            // Check if tournament is complete
            if (ri === rounds.length - 1) {
              showToast(`🏆 ${name} wins the tournament!`);
              launchConfetti(200);
              playWin();
              Accounts.recordTournamentComplete();
            }
            Accounts.saveTournament(tournamentState).catch(() => {});
            renderBracket();
          });
        }

        matchDiv.appendChild(teamDiv);
        if (side === 'a') {
          const div = document.createElement('div');
          div.className = 'bracket-divider';
          matchDiv.appendChild(div);
        }
      });

      roundDiv.appendChild(matchDiv);
    });

    bracket.appendChild(roundDiv);
  });

  container.appendChild(bracket);
}

/* =============================================
   AUTH UI
   ============================================= */
function setupAuthModal() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('tab-login').hidden  = which !== 'login';
      document.getElementById('tab-signup').hidden = which !== 'signup';
    });
  });

  // Login submit
  document.getElementById('login-submit').addEventListener('click', async () => {
    clearAuthErrors();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const result   = await Accounts.login({ username, password });
    if (!result.ok) {
      if (result.field === 'username') document.getElementById('login-username-err').textContent = result.msg;
      else if (result.field === 'password') document.getElementById('login-password-err').textContent = result.msg;
      else document.getElementById('login-error').textContent = result.msg;
      return;
    }
    closeAuthModal();
    onProfileChange();
    showToast(`Welcome back, ${result.profile.displayName}!`);
  });

  // Signup submit
  document.getElementById('signup-submit').addEventListener('click', async () => {
    clearAuthErrors();
    const username    = document.getElementById('signup-username').value;
    const displayName = document.getElementById('signup-display').value;
    const password    = document.getElementById('signup-password').value;
    const result      = await Accounts.signup({ username, displayName, password });
    if (!result.ok) {
      if (result.field === 'username') document.getElementById('signup-username-err').textContent = result.msg;
      else if (result.field === 'display') document.getElementById('signup-display-err').textContent = result.msg;
      else if (result.field === 'password') document.getElementById('signup-password-err').textContent = result.msg;
      else document.getElementById('signup-error').textContent = result.msg;
      return;
    }
    closeAuthModal();
    onProfileChange();
    showToast(`Account created! Welcome, ${result.profile.displayName}!`);
  });

  // Guest login
  document.getElementById('guest-login').addEventListener('click', () => {
    Accounts.loginGuest();
    closeAuthModal();
    onProfileChange();
    showToast('Continuing as guest');
  });

  // Close
  document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
  document.getElementById('auth-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
}

function clearAuthErrors() {
  ['login-username-err','login-password-err','login-error','signup-username-err','signup-display-err','signup-password-err','signup-error']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
}

function openAuthModal()  { document.getElementById('auth-modal').hidden = false; }
function closeAuthModal() { document.getElementById('auth-modal').hidden = true;  }

function onProfileChange() {
  updateNavProfile();
  renderDashboard().catch(() => {});
  renderSportTabs();
}

/* =============================================
   NAV & SECTION SWITCHING
   ============================================= */
function switchSection(name) {
  currentSection = name;
  document.querySelectorAll('.app-section').forEach(s => {
    s.hidden = !s.id.endsWith(name);
  });
  // Update nav highlights
  document.querySelectorAll('.nav-tab, .bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  document.querySelectorAll('.drawer-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  // Lazy-load section data
  if (name === 'dashboard')      renderDashboard().catch(() => {});
  if (name === 'saves')          renderSavesSection();
  if (name === 'presets')        renderPresetsSection();
  if (name === 'custom-sports')  renderCustomSportsSection();
  if (name === 'profile-edit')   renderProfileEdit();
  if (name === 'profile-switch') renderProfileSwitch();
  if (name === 'tournament') {
    document.getElementById('tournament-setup').style.display = 'block';
    document.getElementById('bracket-container').hidden = true;
  }
  // Close drawer
  document.getElementById('profile-drawer').hidden = true;
}

/* =============================================
   IMPORT / EXPORT JSON
   ============================================= */
function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported!');
}

function importJSON(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try { callback(JSON.parse(e.target.result)); }
    catch { showToast('Invalid JSON file.'); }
  };
  reader.readAsText(file);
}

/* =============================================
   THEME TOGGLE
   ============================================= */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const profile = Accounts.getCurrentProfile();
  if (!profile.isGuest) Accounts.updateProfile({ themePref: next }).catch(() => {});
  updateThemeBtn();
}

function updateThemeBtn() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const label  = isDark ? '🌙 Dark' : '☀️ Light';
  document.getElementById('theme-toggle').textContent           = isDark ? '🌙' : '☀️';
  document.getElementById('theme-toggle-drawer').textContent    = label;
}

/* =============================================
   HELPER
   ============================================= */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* =============================================
   KEYBOARD SHORTCUTS
   ============================================= */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if typing in an input/textarea/contenteditable
    const tag = e.target.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      e.target.isContentEditable;

    if (!isEditing) {
      switch(e.key) {
        case '1': addScore('a', 1); break;
        case '2': addScore('b', 1); break;
        case 'q': case 'Q': undoLast(); break;
        case 'r': case 'R': document.getElementById('reset-btn').click(); break;
        case ' ': e.preventDefault();
          state.timerRunning ? pauseTimer() : startTimer(); break;
        case 's': case 'S': saveToSlot(1); break;
        case 't': case 'T': toggleTheme(); break;
        case '?': document.getElementById('shortcuts-modal').hidden = false; break;
        case 'Escape':
          document.querySelectorAll('.modal-overlay, .win-screen').forEach(m => { m.hidden = true; });
          document.getElementById('settings-panel').hidden  = true;
          document.getElementById('profile-drawer').hidden  = true;
          break;
      }
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => { m.hidden = true; });
      document.getElementById('settings-panel').hidden = true;
    }
  });
}

/* =============================================
   AVATAR IMAGE UPLOAD
   ============================================= */
function setupAvatarUpload() {
  document.getElementById('avatar-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      document.getElementById('avatar-preview').innerHTML = `<img src="${dataUrl}" alt="avatar" />`;
      Accounts.updateProfile({ avatarImage: dataUrl }).then(() => updateNavProfile());
    };
    reader.readAsDataURL(file);
  });
}

/* =============================================
   AUTOSAVE RECOVERY
   ============================================= */
function checkAutosaveRecovery() {
  const snap = Accounts.getAutosave();
  if (snap && !snap.matchOver && snap.startTime) {
    const ago = Math.floor((Date.now() - snap.savedAt) / 60000);
    if (ago < 120) { // only recover if less than 2 hours old
      if (confirm(`Recover unfinished match from ${ago} min ago? (${snap.teamA} vs ${snap.teamB})`)) {
        restoreSnapshot(snap);
        showToast('Match recovered!');
      }
    }
  }
}

/* =============================================
   MAIN INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Wait briefly for accounts.js to finish DB init
  setTimeout(init, 80);
});

let __initialized = false;
async function init() {
  if (__initialized) return; // prevent double-binding if init() is ever triggered twice
  __initialized = true;

  // Build sport tabs
  await renderSportTabs();

  // Initial render
  renderScoreboard();
  renderTimer();
  updateNavProfile();
  updateThemeBtn();

  // Auth modal setup
  setupAuthModal();
  setupKeyboardShortcuts();
  setupAvatarUpload();
  setupTournamentUI();

  // Score buttons — single delegated listener on parent to avoid double-firing
  document.getElementById('main-scoreboard').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-team][data-delta]');
    if (btn) {
      addScore(btn.dataset.team, parseInt(btn.dataset.delta));
    }
  });

  // Undo
  document.getElementById('undo-btn').addEventListener('click', undoLast);

  // Reset
  document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('reset-modal').hidden = false;
  });
  document.getElementById('reset-confirm').addEventListener('click', () => {
    document.getElementById('reset-modal').hidden = true;
    resetMatch();
  });
  document.getElementById('reset-cancel').addEventListener('click', () => {
    document.getElementById('reset-modal').hidden = true;
  });
  document.getElementById('reset-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('reset-modal').hidden = true;
  });

  // Save
  document.getElementById('save-btn').addEventListener('click', () => {
    saveToSlot(1);
  });
  document.getElementById('quick-save-btn')?.addEventListener('click', () => saveToSlot(1));

  // Share
  document.getElementById('share-btn').addEventListener('click', shareResult);
  document.getElementById('win-share').addEventListener('click', shareResult);

  // Win screen
  document.getElementById('win-new-match').addEventListener('click', () => {
    document.getElementById('win-screen').hidden = true;
    resetMatch();
  });
  document.getElementById('win-view-stats').addEventListener('click', () => {
    document.getElementById('win-screen').hidden = true;
    switchSection('dashboard');
  });

  // Timer controls
  document.getElementById('timer-start-pause').addEventListener('click', () => {
    state.timerRunning ? pauseTimer() : startTimer();
  });
  document.getElementById('timer-reset').addEventListener('click', resetTimer);

  // Settings
  document.getElementById('settings-open-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-panel').hidden = true;
  });
  document.getElementById('settings-apply').addEventListener('click', applySettings);
  document.getElementById('settings-cancel').addEventListener('click', () => {
    document.getElementById('settings-panel').hidden = true;
  });
  document.getElementById('settings-backdrop').addEventListener('click', () => {
    document.getElementById('settings-panel').hidden = true;
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('theme-toggle-drawer').addEventListener('click', toggleTheme);

  // Sound toggle
  document.getElementById('sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').textContent = soundEnabled ? '🔊' : '🔇';
    showToast(soundEnabled ? 'Sound on' : 'Sound off');
  });

  // Shortcuts modal
  document.getElementById('shortcuts-btn').addEventListener('click', () => {
    document.getElementById('shortcuts-modal').hidden = false;
  });
  document.getElementById('shortcuts-close').addEventListener('click', () => {
    document.getElementById('shortcuts-modal').hidden = true;
  });
  document.getElementById('shortcuts-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('shortcuts-modal').hidden = true;
  });

  // Profile drawer
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('profile-drawer').hidden = false;
  });
  document.getElementById('profile-btn').addEventListener('click', () => {
    const profile = Accounts.getCurrentProfile();
    if (profile.isGuest) openAuthModal();
    else document.getElementById('profile-drawer').hidden = false;
  });
  document.getElementById('profile-btn-mobile').addEventListener('click', () => {
    const profile = Accounts.getCurrentProfile();
    if (profile.isGuest) openAuthModal();
    else document.getElementById('profile-drawer').hidden = false;
  });
  document.getElementById('drawer-close').addEventListener('click', () => {
    document.getElementById('profile-drawer').hidden = true;
  });
  document.getElementById('drawer-backdrop').addEventListener('click', () => {
    document.getElementById('profile-drawer').hidden = true;
  });

  // Drawer nav items
  document.querySelectorAll('.drawer-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchSection(item.dataset.section);
    });
  });

  // Logout
  document.getElementById('drawer-logout').addEventListener('click', () => {
    Accounts.logout();
    document.getElementById('profile-drawer').hidden = true;
    onProfileChange();
    showToast('Signed out');
  });

  // Top nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Bottom nav
  document.querySelectorAll('.bottom-nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Logo link
  document.getElementById('logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('scoreboard');
  });

  // Team name inline edit
  ['team-a-name', 'team-b-name'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('blur', () => {
      if (id === 'team-a-name') state.teamA = el.textContent.trim() || 'Team A';
      else                      state.teamB = el.textContent.trim() || 'Team B';
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });

  // History clear
  document.getElementById('history-clear-btn').addEventListener('click', () => {
    state.history = [];
    renderHistory();
  });

  // Custom sport modal
  document.getElementById('add-custom-sport-btn').addEventListener('click', () => {
    openCustomSportModal();
  });
  document.getElementById('new-custom-sport-btn').addEventListener('click', () => {
    openCustomSportModal();
  });
  document.getElementById('cs-save-btn').addEventListener('click', saveCustomSport);
  document.getElementById('cs-modal-close').addEventListener('click', () => {
    document.getElementById('custom-sport-modal').hidden = true;
  });
  document.getElementById('cs-export-btn').addEventListener('click', () => {
    const name = document.getElementById('cs-name').value || 'custom';
    exportJSON({
      name: document.getElementById('cs-name').value,
      icon: document.getElementById('cs-icon').value,
      winScore: parseInt(document.getElementById('cs-win-score').value),
      winByTwo: document.getElementById('cs-win-by-two').checked,
      sets: parseInt(document.getElementById('cs-sets').value),
    }, `sport_${name}.json`);
  });
  document.getElementById('custom-sport-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });

  // Import custom sport
  document.getElementById('import-sport-btn').addEventListener('click', () => {
    document.getElementById('import-sport-file').click();
  });
  document.getElementById('import-sport-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file, async (data) => {
      await Accounts.saveCustomSport(data);
      renderCustomSportsSection();
      renderSportTabs();
      showToast('Sport imported!');
    });
    e.target.value = '';
  });

  // Preset modal
  document.getElementById('new-preset-btn').addEventListener('click', () => openPresetModal());
  document.getElementById('pm-save-btn').addEventListener('click', savePreset);
  document.getElementById('pm-close').addEventListener('click', () => {
    document.getElementById('preset-modal').hidden = true;
  });
  document.getElementById('pm-export-btn').addEventListener('click', () => {
    const name = document.getElementById('pm-name').value || 'preset';
    exportJSON({ name, sport: document.getElementById('pm-sport').value }, `preset_${name}.json`);
  });
  document.getElementById('preset-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('import-preset-btn').addEventListener('click', () => {
    document.getElementById('import-preset-file').click();
  });
  document.getElementById('import-preset-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file, async (data) => {
      await Accounts.savePreset(data);
      renderPresetsSection();
      showToast('Preset imported!');
    });
    e.target.value = '';
  });

  // Profile edit
  document.getElementById('save-profile-btn').addEventListener('click', saveProfileChanges);
  document.querySelectorAll('.pref-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pref-theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Add profile / profile switch
  document.getElementById('add-profile-btn').addEventListener('click', openAuthModal);

  // Tournament new
  document.getElementById('new-tournament-btn').addEventListener('click', () => {
    tournamentState = null;
    bracketWinners  = {};
    document.getElementById('tournament-setup').style.display = 'block';
    document.getElementById('bracket-container').hidden = true;
  });

  // Autosave recovery
  checkAutosaveRecovery();

  console.log('✅ ScoreKeep Pro initialized');
}
