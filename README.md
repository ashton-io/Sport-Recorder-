# 🏟 ScoreKeep Pro

A fully-featured, offline-capable, multi-sport scorekeeping Progressive Web App (PWA) — deployable to GitHub Pages with zero configuration.

![ScoreKeep Pro Screenshot](screenshot-placeholder.png)

> **Live Demo:** `https://yourusername.github.io/scoreboard/`

---

## ✨ Features at a Glance

- **6 built-in sports** — Pickleball, Volleyball, Tennis, Basketball, Soccer, and Custom
- **Full offline support** via Service Worker
- **User accounts** with SHA-256 password hashing (Web Crypto API)
- **Statistics dashboard** with Canvas-drawn charts
- **Tournament bracket** generator (4 / 8 / 16 teams)
- **Custom sport creator** with export/import
- **Rule presets** — save, tag, share as JSON
- **5 save slots** per profile + autosave recovery
- **17+ achievements** with animated popups
- **Confetti** on match win (canvas-based)
- **Sound effects** via Web Audio API
- **Wake Lock API** keeps screen on during play
- **Web Share API** for sharing results
- **Dark + Light mode** per profile
- **Fully keyboard-accessible** (WCAG AA)
- **PWA installable** — Add to Home Screen on iOS/Android

---

## 🚀 GitHub Pages Setup (5 steps)

1. **Fork or clone** this repository
2. Copy all files into your repo root (or a subfolder like `/scoreboard`)
3. Go to your repo → **Settings → Pages**
4. Under **Source**, select `main` branch → `/root` (or your subfolder)
5. Click **Save** — your site will be live at `https://yourusername.github.io/scoreboard/`

> ✅ No build step. No npm install. No server required. It works immediately.

### Subfolder deployment

If deploying to a subfolder (e.g. `username.github.io/scoreboard/`), all paths in the code are already relative — nothing needs to change.

---

## 📁 File Structure

```
scoreboard/
├── index.html      — App shell and all UI markup
├── style.css       — Full stylesheet (dark/light themes, responsive)
├── script.js       — Game logic, UI, sports, charts, tournament
├── accounts.js     — Auth, profiles, stats, IndexedDB, achievements
├── manifest.json   — PWA manifest (Add to Home Screen)
├── sw.js           — Service Worker for offline support
└── README.md       — This file
```

---

## 🎮 Sports & Default Rules

| Sport       | Points | Win by 2 | Sets | Serve Tracking | Side Switch |
|-------------|--------|----------|------|----------------|-------------|
| Pickleball  | 11     | ✅       | 1    | ✅             | ✅          |
| Pickleball+ | 21     | ✅       | 1    | ✅             | ✅          |
| Volleyball  | 25     | ✅       | 5    | ✅             | ❌          |
| Tennis      | 6      | ✅       | 3    | ✅             | ✅          |
| Basketball  | Free   | ❌       | 1    | ❌             | ❌          |
| Soccer      | Free   | ❌       | 1    | ❌             | ✅          |

### Customizing Default Rules

Edit the `SPORTS` object at the top of `script.js`:

```js
const SPORTS = {
  pickleball: {
    id: 'pickleball', label: 'Pickleball', icon: '🏓',
    defaults: {
      winScore: 11,        // Points needed to win
      winByTwo: true,      // Must win by 2 points
      sets: 1,             // Number of sets
      serveTracking: true, // Show serving indicator
      sideSwitching: true, // Prompt side switch
      scoreIncrements: [1],// Show +1 / +2 / +3 buttons
      timedMatch: false,   // Start timer automatically
    },
  },
  // Add your sport here...
};
```

### Adding a New Built-in Sport

Add an entry to the `SPORTS` object in `script.js`:

```js
cornhole: {
  id: 'cornhole', label: 'Cornhole', icon: '🎯',
  defaults: {
    winScore: 21,
    winByTwo: true,
    sets: 1,
    serveTracking: false,
    sideSwitching: false,
    scoreIncrements: [1, 3],
    timedMatch: false,
  },
},
```

---

## ⌨️ Keyboard Shortcuts

| Key       | Action                          |
|-----------|---------------------------------|
| `1`       | +1 point to Team A              |
| `2`       | +1 point to Team B              |
| `Q`       | Undo last action                |
| `R`       | Reset match (shows confirm)     |
| `Space`   | Start / Pause timer             |
| `S`       | Quick save to slot 1            |
| `T`       | Toggle dark / light theme       |
| `?`       | Show keyboard shortcuts         |
| `Escape`  | Close any open modal or panel   |

> On-screen shortcut reference: click the ⌨️ button in the top navigation bar.

---

## 💾 Save & Export

### Saving Games
- **Autosave** — every score change is saved automatically
- **Autosave Recovery** — on reload, you'll be offered to resume an unfinished match
- **Manual saves** — up to 5 named slots per profile (Saves section)
- **Quick save** — press `S` or click 💾 to save to slot 1 instantly

### Exporting / Importing Settings

**Rule Presets:**
1. Go to **Presets** section
2. Click **Export** on any preset → downloads a `.json` file
3. Share the file with anyone
4. They click **Import** and select the file → preset is loaded instantly

**Custom Sports:**
1. Go to **Custom Sports** section
2. Click **Export** on any sport
3. Recipient clicks **Import** in their Custom Sports section

**Format example (`preset_casual_pickleball.json`):**
```json
{
  "name": "Casual Pickleball",
  "sport": "pickleball",
  "tags": ["casual"],
  "settings": {
    "winScore": 11,
    "winByTwo": true,
    "sets": 1,
    "serveTracking": true
  }
}
```

---

## 👤 Account System

Since this is a static site, all data lives on-device:

| Storage          | Used for                                        |
|------------------|-------------------------------------------------|
| `localStorage`   | Profile list, current session, autosave, prefs  |
| `IndexedDB`      | Match history, save slots, presets, custom sports |
| Web Crypto API   | SHA-256 password hashing (never stored in plain text) |

- Up to **10 profiles** per device
- **Guest mode** — full scorekeeping, no account needed
- Profiles are **device-local** — not synced to any server

---

## 🏆 Achievements

| Achievement       | Condition                        |
|-------------------|----------------------------------|
| 🎮 First Match    | Complete your first match        |
| 🥇 First Victory  | Win your first match             |
| 🔥 On Fire        | Win 3 in a row                   |
| ⚡ Unstoppable    | Win 5 in a row                   |
| 🌪️ Legendary      | Win 10 in a row                  |
| 🎯 Regular Player | Play 10 matches                  |
| 🏅 Veteran        | Play 50 matches                  |
| 🏆 Champion       | Play 100 matches                 |
| 🏓 Pickleball Pro | Win 10 pickleball matches        |
| 🎾 Tennis Ace     | Win 10 tennis matches            |
| 🏀 Hoops Star     | Win 10 basketball matches        |
| 🎨 Custom Creator | Create a custom sport            |
| ⚙️ Preset Master  | Create 5 rule presets            |
| 🎪 Tournament Host| Complete a tournament bracket    |
| 🦉 Night Owl      | Play a match after midnight      |
| 💾 Save Scummer   | Use all 5 save slots             |
| 🌍 Multi-Sport    | Play 3 different sports          |

---

## 🎨 Customization

### Accent Color (per profile)
Go to **Edit Profile → Accent Color** — the color picker updates the entire app's accent color instantly.

### Theme
- Toggle via **T** key or the 🌙 button
- Per-profile preference is saved and applied on login

### Fonts
The app uses:
- **Bebas Neue** — display / scores / headings (Google Fonts)
- **DM Sans** — body text, buttons, labels

To change fonts, edit the `@import` in `index.html` and update `--font-display` / `--font-body` in `style.css`.

---

## 🐣 Easter Egg

Type the **Konami Code** on any screen:

```
↑ ↑ ↓ ↓ ← → ← → B A
```

🎉 Party mode activates for 10 seconds.

---

## 🛠️ Technical Details

| Feature          | Implementation              |
|------------------|-----------------------------|
| Password hashing | Web Crypto API (SHA-256)    |
| Large data store | IndexedDB                   |
| Preferences      | localStorage                |
| Offline support  | Service Worker (Cache API)  |
| PWA install      | manifest.json               |
| Charts           | Canvas API (no library)     |
| Confetti         | Canvas API (no library)     |
| Sound effects    | Web Audio API               |
| Screen-on        | Wake Lock API               |
| Share            | Web Share API + clipboard   |
| Haptics          | navigator.vibrate()         |
| No dependencies  | Zero npm / CDN frameworks   |

---

## 🔒 Privacy

- **No data leaves your device** — ever
- No analytics, no tracking, no ads
- Passwords are SHA-256 hashed before storage
- All data is stored locally in your browser

---

## 📱 PWA Installation

### Android (Chrome)
1. Visit the site in Chrome
2. Tap the **⋮ menu → Add to Home Screen**
3. App installs with full offline support

### iOS (Safari)
1. Visit the site in Safari
2. Tap the **Share button → Add to Home Screen**
3. App runs in standalone mode

---

## 🖨️ Print Support

The app includes print-friendly CSS:
- **Match summaries** — print the scoreboard and history log
- **Brackets** — print your tournament bracket
- Score buttons and nav are automatically hidden when printing

---

## 📄 License

MIT License

Copyright (c) 2025 ScoreKeep Pro Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

*Built with ❤️ — no dependencies, no server, no nonsense.*
