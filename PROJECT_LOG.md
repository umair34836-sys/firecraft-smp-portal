# FireCraft SMP — Project Log

> Last updated: 2026-10-06
> Branch: `claude/stoic-maxwell-avsg81` → `umair34836-sys/firecraft-smp-portal`

---

## Quick Revision (30-second read)

| Area | Status |
|------|--------|
| Website frontend | ✅ Cleaned up — powers removed, meta fixed, 404 added |
| Firebase Hosting config | ✅ Fixed — ignore rules, errorPage added |
| Service Worker (PWA) | ✅ Fixed — stale cache paths updated |
| Sitemap | ✅ Updated — leaderboard added, dates current |
| Discord bot URLs | ✅ Fixed — old domain replaced |
| Plugin config URLs | ✅ Fixed — old domain replaced |
| Firestore rules | ✅ Cleaned — powerAssignments block removed |
| Admin ticket emails | ❌ BROKEN — EmailJS template placeholder not replaced |
| Leaderboard data | ❌ EMPTY — plugin doesn't write hearts/kills to Firestore |
| Gallery content | ❌ EMPTY — no screenshots uploaded yet |
| Server-side issues | ⚠️ DEFERRED — list below |

---

## Website Pages

### Pages that exist

| URL | File | Notes |
|-----|------|-------|
| `/` | `index.html` | Homepage — apply, status, support, reviews, gallery |
| `/features/` | `features/index.html` | 11 powers, 5 armors, 63 companions |
| `/rules/` | `rules/index.html` | Server rules |
| `/faq/` | `faq/index.html` | 18 FAQ entries |
| `/leaderboard/` | `leaderboard/index.html` | Reads `approvedPlayers` from Firestore |
| `/404` | `404.html` | Custom 404 — configured in firebase.json |

### Deleted pages

| URL | Reason |
|-----|--------|
| `/powers/` | Spin wheel selection page removed — feature hidden, not in use |

---

## All Changes Made (by category)

### 1. Powers Feature Removal

**Files deleted:**
- `powers/index.html` — spin wheel UI page
- `js/powers.js` — wheel animation + Firestore powerAssignments transaction
- `css/powers.css` — wheel UI styles

**Files updated:**
- `sitemap.xml` — removed `/powers/` URL entry
- `faq/index.html` — removed dead link to `/powers/`, rewrote Powers FAQ
- `firestore.rules` — removed `powerAssignments` collection block
- `index.html` — removed "custom powers" from 4 meta description fields

**Note:** The in-game CustomPowers plugin still runs — 11 powers still exist on the server (Fire, Dark, Wind, Ice, Lightning, Trader, Rift, Warden, Wither, Dragon, Gravity). Only the website's spin wheel selection page was removed.

---

### 2. Meta / SEO Fixes

| File | What was fixed |
|------|---------------|
| `index.html` | Removed "custom powers" from description, og:description, twitter:description, JSON-LD description |
| `features/index.html` | `<title>` and `og:title` updated to "Custom Plugins & Features" (was "Custom Powers & Plugins") |
| `features/index.html` | `twitter:description` corrected — was "11 unique armor sets" (wrong), now "11 unique powers, 5 armor sets" |
| `features/index.html` | `twitter:title` updated to "Custom Plugins & Features" |
| `features/index.html` | Added `twitter:description` |
| `rules/index.html` | Added missing `twitter:description` |
| `leaderboard/index.html` | Added missing `twitter:description` |
| `faq/index.html` | Added missing `twitter:description` |
| `faq/index.html` | Powers FAQ rewritten — was describing wrong 6-buff system (Miner/PvPer/Flyer…), now correctly describes 11-power plugin system |

---

### 3. Firebase Hosting (`firebase.json`)

**Added to `ignore` list:**
- `discord-bot/**` — bot files were being deployed to hosting unnecessarily
- `plugin/**` — plugin Java source files same issue

**Added:**
- `"errorPage": "/404.html"` — custom 404 page now served instead of raw Firebase error

---

### 4. Service Worker / PWA (`sw.js`)

- Cache version bumped: `firecraft-v1` → `firecraft-v2`
- Fixed stale paths:
  - `/features.html` → `/features/`
  - `/rules.html` → `/rules/`
  - `/faq.html` → `/faq/`
- Added `/leaderboard/` to static cache list

---

### 5. Sitemap (`sitemap.xml`)

- Added `/leaderboard/` entry (changefreq: daily, priority: 0.8)
- All `<lastmod>` dates updated to `2026-10-06`

---

### 6. Custom 404 Page (`404.html`)

- Created from scratch
- Full nav (Home / Apply / Status / Support / Reviews / Features / Rules / FAQ / Leaderboard / Discord)
- "Go Home" and "FAQ" buttons
- Includes `bg.js` and `nav.js`

---

### 7. Discord Bot (`discord-bot/bot.js`)

- Line 5: `"https://firecraft-smp-portal.web.app"` → `"https://www.firecraft.fun"`
- Line 41 footer: `"firecraft-smp-portal.web.app"` → `"firecraft.fun"`

---

### 8. Plugin Config (`plugin/FireCraftNotifier/src/main/resources/config.yml`)

- `website-url`: `"https://firecraft-smp-portal.web.app"` → `"https://www.firecraft.fun"`

---

## Pending / Broken Items (Frontend)

### ❌ Admin ticket emails broken
- **File:** `js/app.js` line 11
- **Issue:** `EJS_TPL_TICKET = 'REPLACE_TEMPLATE_TICKET'`
- **Fix needed:** Go to EmailJS dashboard → create a ticket notification email template → replace `'REPLACE_TEMPLATE_TICKET'` with the real template ID (e.g. `'template_xxxxxxx'`)
- Application emails work fine — template `template_tzgqo7a` is set correctly on line 10

### ❌ Gallery is empty
- **Location:** `index.html` `<section id="gallery">`
- **Issue:** Shows "No screenshots yet" — no documents in Firestore `gallery` collection
- **Fix needed:** Admin uploads screenshots via admin panel OR manually add documents to Firestore `gallery` collection with `{ imageUrl, caption, uploadedAt }` fields

### ❌ Leaderboard shows `—` for all stats
- **File:** `leaderboard/index.html`
- **Issue:** Reads `hearts`, `maxHearts`, `kills` from `approvedPlayers` collection but no plugin writes these fields — all stats show `—`
- **Fix needed:** Server-side — FireCraftNotifier plugin (or a new plugin) must write these fields to Firestore on player kill/death/join
- See Server-Side Issues section below

---

## Pending / Broken Items (Server-Side — DEFERRED)

These were found but not fixed yet. User requested server-side work separately.

### Plugin Issues

| Issue | File | Detail |
|-------|------|--------|
| Hardcoded fallback URL | `FireCraftNotifier.java` line 132 | `getString("website-url", "https://firecraft-smp-portal.web.app")` — old domain as default |
| `discord-bot/.env.example` stale URL | `.env.example` | `WEBSITE_URL=https://firecraft-smp-portal.web.app` |
| `api-version` mismatch | `plugin.yml` files | FireCraftEarn/FireCraftPartner say `1.20`, server runs `1.21` |
| Java compiler mismatch | `pom.xml` files | Compiled for Java 17, but server may run Java 21 |
| FireCraftEarn `config.yml` | Plugin config | Has placeholder values not filled in |
| FireCraftPartner `config.yml` | Plugin config | Has placeholder values not filled in |

### Leaderboard Data Pipeline (Critical)

The leaderboard will permanently show `—` until a plugin writes these fields to the `approvedPlayers/{ign}` Firestore document:

```
hearts      (number)   — current hearts
maxHearts   (number)   — max hearts 
kills       (number)   — PvP kill count
eliminated  (boolean)  — true when hearts reach 0
approvedAt  (timestamp)— already set at whitelist time ✓
```

Suggested approach: FireCraftNotifier plugin adds a Firestore write on `PlayerDeathEvent` (PvP) and periodically syncs heart counts.

### Firestore Security Note

```
match /serverStatus/{doc} {
  allow write: if true;  // ← no auth required — any request can write
}
```
Currently open write on `serverStatus`. Low risk since it's internal plugin data, but worth locking to authenticated server accounts when `isServerAccount()` is implemented properly.

---

## Firebase Collections Reference

| Collection | Who writes | Who reads | Notes |
|------------|-----------|-----------|-------|
| `users` | Player (self) / Admin | Self / Admin | Auth profile |
| `usernames` | Player (on register) | Public | Username → UID lookup |
| `applications` | Player | Admin / Self / Public (approved only) | Whitelist applications |
| `tickets` | Player | Admin / Self | Support tickets |
| `approvedPlayers` | Admin | Public | Leaderboard source — needs hearts/kills fields |
| `settings` | Admin | Public | Site-wide settings |
| `announcements` | Admin | Public | Homepage announcements |
| `gallery` | Admin | Public | Screenshots — currently empty |
| `reviews` | Player (one per UID) | Public | Star ratings + text |
| `serverStatus` | Plugin (unauthenticated) | Admin | Live server status |
| `playerReports` | Plugin (unauthenticated) | Admin | In-game `/report` |
| `playerSessions` | Plugin (unauthenticated) | Admin | Join/quit logs |
| `staff` | Admin | Admin | Staff list |
| `partnerServers` | Admin | Public | Earn system partner servers |
| `serverAccounts` | Admin | Admin / Self | Maps plugin Firebase UID → serverId |
| `earnSettings` | Admin | Public | Min withdrawal, currency etc. |
| `activeSessions` | Server account | Admin / Self | Active playtime sessions |
| `playtimeLogs` | Server account | Admin / Self | Playtime records |
| `wallets` | Admin only | Admin / Self | Player coin balance |
| `withdrawalRequests` | Player | Admin / Self | Pending withdrawals |
| `sponsoredPlacements` | Admin | Public | Sponsored content |

---

## Earn / Wallet System (Currently Hidden)

The earn/wallet system exists in the codebase but is intentionally hidden:

- `index.html`: `#walletBox` has `style="display:none!important"`
- `index.html`: `<section id="earn">` has `class="hidden"`

**To enable when ready:** Remove `style="display:none!important"` from `#walletBox` and remove `class="hidden"` from `#earn` in `index.html`.

Requires: `FireCraftEarn` plugin running, `wallets` collection populated, `earnSettings` configured.

---

## Plugins Summary

| Plugin | Version | Purpose |
|--------|---------|---------|
| FireCraftNotifier | v1.4.0 | Reports server status, player sessions, player reports to Firestore + Discord |
| FireCraftEarn | v1.0.0 | Tracks playtime, manages coin wallets, handles partner server sessions |
| FireCraftPartner | v1.0.0 | Partner server session reporting (for cross-server earn) |
| CustomPowers | (external) | 11 powers: Fire/Dark/Wind/Ice/Lightning/Trader/Rift/Warden/Wither/Dragon/Gravity |
| CustomArmors | (external) | 5 armor sets: Ember Guard/Frost Plate/Void Weave/Warden Carapace/Dragon Scale |
| CustomMobs | (external) | 63 tameable companions, level 1–100, loyalty system |

---

## Admin Account

- Firebase UID: `5yLTkB3FBRUauL0fc09vcLhYj7y2`
- Hard-coded in `firestore.rules` `isAdmin()` function
- All admin-only Firestore operations require this UID

---

## Server Info

| Key | Value |
|-----|-------|
| Server IP | `play.firecraft.fun:20011` |
| Edition | Java Edition only |
| Website | `https://www.firecraft.fun` |
| Discord | `https://discord.gg/k3wmWeBsmD` |
| Firebase project | `firecraft-smp-portal` |
| Hosting public dir | `.` (root of repo) |

---

## CSS Design Tokens (quick reference)

```css
--bg:     #020e06   /* near-black green background */
--red:    #ff8fe3   /* brand pink/magenta (named "red" historically) */
--orange: #ffa827   /* accent orange */
--text:   #f0ffe8   /* off-white text */
--muted:  #8ab899   /* muted green-grey */
--line:   #1a4a1a   /* border/divider color */
--good:   #35d07f   /* success green */
--panel:  (dark card bg)
```

---

## JS Files

| File | Purpose |
|------|---------|
| `js/app.js` | Main app logic — Firebase auth, apply form, ticket form, status checker, reviews |
| `js/firebase-config.js` | Firebase project config object (public, safe to expose) |
| `js/bg.js` | Animated particle background (canvas) |
| `js/nav.js` | Mobile full-screen overlay navigation |
| `js/notify.js` | OneSignal push notifications + PWA service worker registration |
| `js/ads.js` | Sponsored placements loader |
| `sw.js` | PWA service worker — offline cache, version `firecraft-v2` |
