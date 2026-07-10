/**
 * accounts.js — ScoreKeep Pro
 * Handles: auth, profiles, sessions, stats, achievements, IndexedDB saves
 * Storage: localStorage (session/prefs) + IndexedDB (match history, saves)
 */

'use strict';

/* =============================================
   CONSTANTS
   ============================================= */
const DB_NAME    = 'ScoreKeepPro';
const DB_VERSION = 2;
const MAX_PROFILES = 10;
const MAX_SAVE_SLOTS = 5;

const AVATAR_EMOJIS = [
  '😊','😎','🏆','🔥','⚡','🦁','🐯','🦊','🐺','🦅',
  '🏀','⚽','🎾','🏓','🏐','🥊','🎯','🏹','🎮','🎲',
  '🌟','💫','🚀','🎸','🧠','💪','🏋','🤺','🏄','🧗'
];

/* =============================================
   ACHIEVEMENTS DEFINITION
   ============================================= */
const ACHIEVEMENTS = [
  { id: 'first_match',     icon: '🎮', name: 'First Match',       desc: 'Complete your first match',              check: (s) => s.totalMatches >= 1 },
  { id: 'win_first',       icon: '🥇', name: 'First Victory',     desc: 'Win your first match',                   check: (s) => s.totalWins >= 1 },
  { id: 'streak_3',        icon: '🔥', name: 'On Fire',           desc: 'Win 3 matches in a row',                 check: (s) => s.longestStreak >= 3 },
  { id: 'streak_5',        icon: '⚡', name: 'Unstoppable',       desc: 'Win 5 matches in a row',                 check: (s) => s.longestStreak >= 5 },
  { id: 'streak_10',       icon: '🌪️', name: 'Legendary',         desc: 'Win 10 matches in a row',                check: (s) => s.longestStreak >= 10 },
  { id: 'matches_10',      icon: '🎯', name: 'Regular Player',    desc: 'Play 10 matches',                        check: (s) => s.totalMatches >= 10 },
  { id: 'matches_50',      icon: '🏅', name: 'Veteran',           desc: 'Play 50 matches',                        check: (s) => s.totalMatches >= 50 },
  { id: 'matches_100',     icon: '🏆', name: 'Champion',          desc: 'Play 100 matches',                       check: (s) => s.totalMatches >= 100 },
  { id: 'pickleball_pro',  icon: '🏓', name: 'Pickleball Pro',    desc: 'Win 10 pickleball matches',              check: (s) => (s.sportWins?.pickleball || 0) >= 10 },
  { id: 'tennis_ace',      icon: '🎾', name: 'Tennis Ace',        desc: 'Win 10 tennis matches',                  check: (s) => (s.sportWins?.tennis || 0) >= 10 },
  { id: 'hoops_star',      icon: '🏀', name: 'Hoops Star',        desc: 'Win 10 basketball matches',              check: (s) => (s.sportWins?.basketball || 0) >= 10 },
  { id: 'custom_creator',  icon: '🎨', name: 'Custom Creator',    desc: 'Create a custom sport',                  check: (s) => s.customSportsCreated >= 1 },
  { id: 'preset_master',   icon: '⚙️', name: 'Preset Master',     desc: 'Create 5 rule presets',                  check: (s) => s.presetsCreated >= 5 },
  { id: 'tournament_host', icon: '🎪', name: 'Tournament Host',   desc: 'Complete a tournament bracket',          check: (s) => s.tournamentsCompleted >= 1 },
  { id: 'night_owl',       icon: '🦉', name: 'Night Owl',         desc: 'Play a match after midnight',            check: (s) => s.playedAfterMidnight === true },
  { id: 'save_scummer',    icon: '💾', name: 'Save Scummer',      desc: 'Use all 5 save slots',                   check: (s) => s.maxSaveSlotUsed >= 5 },
  { id: 'multi_sport',     icon: '🌍', name: 'Multi-Sport Athlete', desc: 'Play 3 different sports',              check: (s) => Object.keys(s.sportWins || {}).length >= 3 },
];

/* =============================================
   INDEXEDDB SETUP
   ============================================= */
let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      // Match history store
      if (!d.objectStoreNames.contains('matches')) {
        const ms = d.createObjectStore('matches', { keyPath: 'id', autoIncrement: true });
        ms.createIndex('profileId', 'profileId', { unique: false });
        ms.createIndex('timestamp', 'timestamp', { unique: false });
      }
      // Save slots store
      if (!d.objectStoreNames.contains('saves')) {
        const ss = d.createObjectStore('saves', { keyPath: 'id' });
        ss.createIndex('profileId', 'profileId', { unique: false });
      }
      // Presets store
      if (!d.objectStoreNames.contains('presets')) {
        const ps = d.createObjectStore('presets', { keyPath: 'id' });
        ps.createIndex('profileId', 'profileId', { unique: false });
      }
      // Custom sports store
      if (!d.objectStoreNames.contains('customSports')) {
        const cs = d.createObjectStore('customSports', { keyPath: 'id' });
        cs.createIndex('profileId', 'profileId', { unique: false });
      }
      // Tournaments store
      if (!d.objectStoreNames.contains('tournaments')) {
        const ts = d.createObjectStore('tournaments', { keyPath: 'id' });
        ts.createIndex('profileId', 'profileId', { unique: false });
      }
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function dbTransaction(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('DB not initialized')); return; }
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    if (req && req.onsuccess !== undefined) {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } else {
      tx.oncomplete = () => resolve();
      tx.onerror    = (e) => reject(e.target.error);
    }
  });
}

/* =============================================
   PASSWORD HASHING (Web Crypto API)
   ============================================= */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data     = encoder.encode(password + 'ScoreKeepPro_salt_v1');
  const hashBuf  = await crypto.subtle.digest('SHA-256', data);
  const hashArr  = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* =============================================
   PROFILE STORAGE (localStorage)
   ============================================= */
function getAllProfiles() {
  try {
    return JSON.parse(localStorage.getItem('skp_profiles') || '[]');
  } catch { return []; }
}

function saveAllProfiles(profiles) {
  localStorage.setItem('skp_profiles', JSON.stringify(profiles));
}

function getProfileById(id) {
  return getAllProfiles().find(p => p.id === id) || null;
}

function getCurrentProfileId() {
  return localStorage.getItem('skp_current_profile') || null;
}

function setCurrentProfileId(id) {
  if (id) localStorage.setItem('skp_current_profile', id);
  else     localStorage.removeItem('skp_current_profile');
}

function getCurrentProfile() {
  const id = getCurrentProfileId();
  return id ? getProfileById(id) : null;
}

function updateProfile(updated) {
  const profiles = getAllProfiles();
  const idx = profiles.findIndex(p => p.id === updated.id);
  if (idx >= 0) profiles[idx] = updated;
  else profiles.push(updated);
  saveAllProfiles(profiles);
}

function deleteProfile(id) {
  const profiles = getAllProfiles().filter(p => p.id !== id);
  saveAllProfiles(profiles);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* =============================================
   GUEST PROFILE
   ============================================= */
function getGuestProfile() {
  return {
    id: 'guest',
    username: 'guest',
    displayName: 'Guest',
    passwordHash: null,
    avatar: '😊',
    avatarImage: null,
    defaultSport: 'pickleball',
    accentColor: '#e94560',
    themePref: 'dark',
    isGuest: true,
    createdAt: Date.now(),
    stats: createEmptyStats(),
    earnedAchievements: [],
  };
}

function createEmptyStats() {
  return {
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalDurationMs: 0,
    sportWins: {},
    sportPlayed: {},
    customSportsCreated: 0,
    presetsCreated: 0,
    tournamentsCompleted: 0,
    playedAfterMidnight: false,
    maxSaveSlotUsed: 0,
    recentResults: [], // array of 'W'|'L'|'D'
  };
}

/* =============================================
   AUTH FUNCTIONS
   ============================================= */
const Accounts = {

  async signup({ username, displayName, password }) {
    // Validate
    if (!username || username.length < 3)
      return { ok: false, field: 'username', msg: 'Username must be at least 3 characters.' };
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return { ok: false, field: 'username', msg: 'Letters, numbers, underscores only.' };
    if (!displayName || displayName.trim().length < 1)
      return { ok: false, field: 'display', msg: 'Display name required.' };
    if (!password || password.length < 6)
      return { ok: false, field: 'password', msg: 'Password must be at least 6 characters.' };

    const profiles = getAllProfiles().filter(p => !p.isGuest);
    if (profiles.length >= MAX_PROFILES)
      return { ok: false, msg: 'Maximum profiles reached on this device.' };
    if (profiles.some(p => p.username.toLowerCase() === username.toLowerCase()))
      return { ok: false, field: 'username', msg: 'Username already taken.' };

    const passwordHash = await hashPassword(password);
    const profile = {
      id: generateId(),
      username: username.toLowerCase(),
      displayName: displayName.trim(),
      passwordHash,
      avatar: '😊',
      avatarImage: null,
      defaultSport: 'pickleball',
      accentColor: '#e94560',
      themePref: 'dark',
      isGuest: false,
      createdAt: Date.now(),
      stats: createEmptyStats(),
      earnedAchievements: [],
    };

    updateProfile(profile);
    setCurrentProfileId(profile.id);
    return { ok: true, profile };
  },

  async login({ username, password }) {
    if (!username) return { ok: false, field: 'username', msg: 'Username required.' };
    if (!password) return { ok: false, field: 'password', msg: 'Password required.' };

    const profiles = getAllProfiles().filter(p => !p.isGuest);
    const profile = profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (!profile) return { ok: false, msg: 'Account not found.' };

    const hash = await hashPassword(password);
    if (hash !== profile.passwordHash) return { ok: false, field: 'password', msg: 'Incorrect password.' };

    setCurrentProfileId(profile.id);
    return { ok: true, profile };
  },

  loginGuest() {
    setCurrentProfileId(null);
    return { ok: true, profile: getGuestProfile() };
  },

  logout() {
    setCurrentProfileId(null);
  },

  getCurrentProfile() {
    const p = getCurrentProfile();
    return p || getGuestProfile();
  },

  async updateProfile(updates) {
    const profile = this.getCurrentProfile();
    if (profile.isGuest) return { ok: false, msg: 'Cannot update guest profile.' };

    // Check username uniqueness if changed
    if (updates.username && updates.username !== profile.username) {
      const profiles = getAllProfiles().filter(p => !p.isGuest && p.id !== profile.id);
      if (profiles.some(p => p.username.toLowerCase() === updates.username.toLowerCase()))
        return { ok: false, field: 'username', msg: 'Username already taken.' };
    }

    // Hash new password if provided
    if (updates.newPassword) {
      updates.passwordHash = await hashPassword(updates.newPassword);
      delete updates.newPassword;
    }

    const updated = { ...profile, ...updates };
    updateProfile(updated);
    return { ok: true, profile: updated };
  },

  deleteProfile(id) {
    if (id === 'guest') return;
    deleteProfile(id);
    if (getCurrentProfileId() === id) setCurrentProfileId(null);
  },

  getAllProfiles() {
    return getAllProfiles();
  },

  switchProfile(id) {
    setCurrentProfileId(id === 'guest' ? null : id);
  },

  /* ---- STATISTICS ---- */
  recordMatch({ sport, winner, teamA, teamB, scoreA, scoreB, durationMs }) {
    const profile = this.getCurrentProfile();
    if (profile.isGuest) return;

    const stats = profile.stats;
    stats.totalMatches++;

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) stats.playedAfterMidnight = true;

    const isWin  = winner === 'a';
    const isLoss = winner === 'b';
    const isDraw = !winner;

    if (isWin)       { stats.totalWins++;   stats.currentStreak = Math.max(0, stats.currentStreak) + 1; }
    else if (isLoss) { stats.totalLosses++; stats.currentStreak = Math.min(0, stats.currentStreak) - 1; }
    else             { stats.totalDraws++;  stats.currentStreak = 0; }

    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);

    if (!stats.sportWins) stats.sportWins = {};
    if (!stats.sportPlayed) stats.sportPlayed = {};
    stats.sportPlayed[sport] = (stats.sportPlayed[sport] || 0) + 1;
    if (isWin) stats.sportWins[sport] = (stats.sportWins[sport] || 0) + 1;

    if (durationMs > 0) stats.totalDurationMs = (stats.totalDurationMs || 0) + durationMs;

    // Recent results (last 20)
    if (!stats.recentResults) stats.recentResults = [];
    stats.recentResults.unshift(isWin ? 'W' : isLoss ? 'L' : 'D');
    if (stats.recentResults.length > 20) stats.recentResults.pop();

    updateProfile({ ...profile, stats });

    // Record in IndexedDB
    const match = {
      id: generateId(),
      profileId: profile.id,
      sport, winner, teamA, teamB, scoreA, scoreB,
      durationMs: durationMs || 0,
      timestamp: Date.now(),
    };
    if (db) {
      const tx = db.transaction('matches', 'readwrite');
      tx.objectStore('matches').add(match);
    }

    // Check achievements
    this._checkAchievements(profile);
  },

  _checkAchievements(profile) {
    const stats = profile.stats;
    const earned = new Set(profile.earnedAchievements || []);
    const newlyEarned = [];

    for (const ach of ACHIEVEMENTS) {
      if (!earned.has(ach.id) && ach.check(stats)) {
        earned.add(ach.id);
        newlyEarned.push(ach);
      }
    }

    if (newlyEarned.length > 0) {
      const updated = { ...profile, earnedAchievements: [...earned] };
      updateProfile(updated);
      // Fire achievement events
      newlyEarned.forEach(ach => {
        window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: ach }));
      });
    }
  },

  getStats() {
    const profile = this.getCurrentProfile();
    return profile.stats || createEmptyStats();
  },

  async getMatchHistory(limit = 20) {
    const profile = this.getCurrentProfile();
    if (profile.isGuest || !db) return [];

    return new Promise((resolve) => {
      const tx    = db.transaction('matches', 'readonly');
      const store = tx.objectStore('matches');
      const idx   = store.index('profileId');
      const req   = idx.getAll(profile.id);
      req.onsuccess = (e) => {
        const all = e.target.result || [];
        all.sort((a, b) => b.timestamp - a.timestamp);
        resolve(all.slice(0, limit));
      };
      req.onerror = () => resolve([]);
    });
  },

  /* ---- SAVE SLOTS ---- */
  async getSaveSlots() {
    const profile = this.getCurrentProfile();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx    = db.transaction('saves', 'readonly');
      const store = tx.objectStore('saves');
      const idx   = store.index('profileId');
      const req   = idx.getAll(profile.id);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = () => resolve([]);
    });
  },

  async saveGame(slotNumber, gameState) {
    const profile = this.getCurrentProfile();
    if (!db) return;

    const save = {
      id: `${profile.id}_slot_${slotNumber}`,
      profileId: profile.id,
      slotNumber,
      savedAt: Date.now(),
      ...gameState,
    };

    return new Promise((resolve) => {
      const tx    = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const req   = store.put(save);
      req.onsuccess = () => {
        // Update stat
        const p2 = this.getCurrentProfile();
        if (!p2.isGuest) {
          const stats = p2.stats;
          stats.maxSaveSlotUsed = Math.max(stats.maxSaveSlotUsed || 0, slotNumber);
          updateProfile({ ...p2, stats });
        }
        resolve(save);
      };
      req.onerror = () => resolve(null);
    });
  },

  async deleteSave(slotNumber) {
    const profile = this.getCurrentProfile();
    if (!db) return;
    const id = `${profile.id}_slot_${slotNumber}`;
    return new Promise((resolve) => {
      const tx    = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      store.delete(id).onsuccess = () => resolve();
    });
  },

  /* ---- AUTOSAVE ---- */
  autosave(gameState) {
    const profile = this.getCurrentProfile();
    const key     = `skp_autosave_${profile.id}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ...gameState, savedAt: Date.now() }));
    } catch(e) { /* storage full */ }
  },

  getAutosave() {
    const profile = this.getCurrentProfile();
    const key     = `skp_autosave_${profile.id}`;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  clearAutosave() {
    const profile = this.getCurrentProfile();
    localStorage.removeItem(`skp_autosave_${profile.id}`);
  },

  /* ---- PRESETS ---- */
  async getPresets() {
    const profile = this.getCurrentProfile();
    if (!db) return getDefaultPresets();

    return new Promise((resolve) => {
      const tx    = db.transaction('presets', 'readonly');
      const store = tx.objectStore('presets');
      const idx   = store.index('profileId');
      const req   = idx.getAll(profile.id);
      req.onsuccess = (e) => {
        const custom = e.target.result || [];
        resolve([...getDefaultPresets(), ...custom]);
      };
      req.onerror = () => resolve(getDefaultPresets());
    });
  },

  async savePreset(preset) {
    const profile = this.getCurrentProfile();
    if (!db) return;

    const p = {
      id: preset.id || generateId(),
      profileId: profile.id,
      isDefault: false,
      createdAt: preset.createdAt || Date.now(),
      ...preset,
    };

    return new Promise((resolve) => {
      const tx    = db.transaction('presets', 'readwrite');
      const store = tx.objectStore('presets');
      store.put(p).onsuccess = () => {
        // Bump stat
        const prof = this.getCurrentProfile();
        if (!prof.isGuest) {
          prof.stats.presetsCreated = (prof.stats.presetsCreated || 0) + 1;
          updateProfile(prof);
          this._checkAchievements(prof);
        }
        resolve(p);
      };
    });
  },

  async deletePreset(id) {
    if (!db) return;
    return new Promise((resolve) => {
      const tx    = db.transaction('presets', 'readwrite');
      const store = tx.objectStore('presets');
      store.delete(id).onsuccess = () => resolve();
    });
  },

  /* ---- CUSTOM SPORTS ---- */
  async getCustomSports() {
    const profile = this.getCurrentProfile();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx    = db.transaction('customSports', 'readonly');
      const store = tx.objectStore('customSports');
      const idx   = store.index('profileId');
      const req   = idx.getAll(profile.id);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = () => resolve([]);
    });
  },

  async saveCustomSport(sport) {
    const profile = this.getCurrentProfile();
    if (!db) return;

    const s = {
      id: sport.id || generateId(),
      profileId: profile.id,
      createdAt: sport.createdAt || Date.now(),
      ...sport,
    };

    return new Promise((resolve) => {
      const tx    = db.transaction('customSports', 'readwrite');
      const store = tx.objectStore('customSports');
      store.put(s).onsuccess = () => {
        const prof = this.getCurrentProfile();
        if (!prof.isGuest) {
          prof.stats.customSportsCreated = (prof.stats.customSportsCreated || 0) + 1;
          updateProfile(prof);
          this._checkAchievements(prof);
        }
        resolve(s);
      };
    });
  },

  async deleteCustomSport(id) {
    if (!db) return;
    return new Promise((resolve) => {
      const tx    = db.transaction('customSports', 'readwrite');
      const store = tx.objectStore('customSports');
      store.delete(id).onsuccess = () => resolve();
    });
  },

  /* ---- TOURNAMENTS ---- */
  async saveTournament(tournament) {
    const profile = this.getCurrentProfile();
    if (!db) return;

    const t = {
      id: tournament.id || generateId(),
      profileId: profile.id,
      savedAt: Date.now(),
      ...tournament,
    };

    return new Promise((resolve) => {
      const tx    = db.transaction('tournaments', 'readwrite');
      const store = tx.objectStore('tournaments');
      store.put(t).onsuccess = () => resolve(t);
    });
  },

  async getTournaments() {
    const profile = this.getCurrentProfile();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx    = db.transaction('tournaments', 'readonly');
      const store = tx.objectStore('tournaments');
      const idx   = store.index('profileId');
      const req   = idx.getAll(profile.id);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = () => resolve([]);
    });
  },

  recordTournamentComplete() {
    const profile = this.getCurrentProfile();
    if (profile.isGuest) return;
    profile.stats.tournamentsCompleted = (profile.stats.tournamentsCompleted || 0) + 1;
    updateProfile(profile);
    this._checkAchievements(profile);
  },
};

/* =============================================
   DEFAULT PRESETS
   ============================================= */
function getDefaultPresets() {
  return [
    {
      id: 'default_pickle_11',
      profileId: '__default__',
      isDefault: true,
      name: 'Pickleball — Rec (11)',
      sport: 'pickleball',
      tags: ['casual', 'default'],
      settings: { winScore: 11, winByTwo: true, sets: 1, serveTracking: true, sideSwitching: true, scoreIncrements: [1] },
    },
    {
      id: 'default_pickle_21',
      profileId: '__default__',
      isDefault: true,
      name: 'Pickleball — Competitive (21)',
      sport: 'pickleball',
      tags: ['tournament', 'default'],
      settings: { winScore: 21, winByTwo: true, sets: 1, serveTracking: true, sideSwitching: true, scoreIncrements: [1] },
    },
    {
      id: 'default_vball_25',
      profileId: '__default__',
      isDefault: true,
      name: 'Volleyball — Best of 5',
      sport: 'volleyball',
      tags: ['tournament', 'default'],
      settings: { winScore: 25, winByTwo: true, sets: 5, serveTracking: true, sideSwitching: false, scoreIncrements: [1] },
    },
    {
      id: 'default_tennis_atp',
      profileId: '__default__',
      isDefault: true,
      name: 'Tennis — Best of 3',
      sport: 'tennis',
      tags: ['default', 'casual'],
      settings: { winScore: 6, winByTwo: true, sets: 3, serveTracking: true, sideSwitching: true, scoreIncrements: [1] },
    },
    {
      id: 'default_bball',
      profileId: '__default__',
      isDefault: true,
      name: 'Basketball — Free Play',
      sport: 'basketball',
      tags: ['default', 'casual'],
      settings: { winScore: 0, winByTwo: false, sets: 1, serveTracking: false, sideSwitching: false, scoreIncrements: [1, 2, 3] },
    },
    {
      id: 'default_soccer',
      profileId: '__default__',
      isDefault: true,
      name: 'Soccer — Full Match',
      sport: 'soccer',
      tags: ['default'],
      settings: { winScore: 0, winByTwo: false, sets: 1, serveTracking: false, sideSwitching: true, scoreIncrements: [1] },
    },
  ];
}

/* =============================================
   EXPORT
   ============================================= */
window.Accounts         = Accounts;
window.ACHIEVEMENTS     = ACHIEVEMENTS;
window.AVATAR_EMOJIS    = AVATAR_EMOJIS;
window.initDB           = initDB;
window.getGuestProfile  = getGuestProfile;

/* =============================================
   INIT ON LOAD
   ============================================= */
document.addEventListener('DOMContentLoaded', async () => {
  try { await initDB(); } catch(e) { console.warn('IndexedDB unavailable, using localStorage only.', e); }

  // Apply saved theme
  const profile = Accounts.getCurrentProfile();
  document.documentElement.setAttribute('data-theme', profile.themePref || 'dark');

  // Apply accent color
  if (profile.accentColor) {
    document.documentElement.style.setProperty('--accent', profile.accentColor);
  }
});
