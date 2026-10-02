# Phase 0 Spike — Android Offline Sync: Runbook

Companion to [android-app-plan.md](android-app-plan.md). The spike exists to answer, on a real device or emulator, the questions that would most change the plan, before any Phase 1–4 work is committed to `main`.

**Branch:** `spike/android-offline` (throwaway; not for merging as-is)

---

## 1. What this spike answers

| # | Question | Hypothesis | If the hypothesis fails / is confirmed |
|---|---|---|---|
| **Q1** | Does `@capacitor-community/sqlite` work in the WebView, and does its data survive app kills? | Yes | **Fails →** re-evaluate the local store (e.g. IndexedDB via Dexie) before Phase 2. |
| **Q2** | Does the Supabase session survive force-stop and device reboot? It lives in WebView `localStorage` via the Lovable-generated client. | Yes | **Fails →** a Preferences-backed auth storage adapter, coordinated with Lovable because `client.ts` is generated (plan §7). |
| **Q3** | Offline cold start with an **expired** access token: what does `useAuth()` report? | supabase-js keeps the refresh token in storage but reports *no user*, so the real app would bounce to `/auth` | **Confirmed →** Phase 2 adds an offline-authenticated state to `AuthContext` and the route guards, and Phase 3's sync waits for auth recovery before pushing. |
| **Q4** | Does a transaction created offline reach Supabase automatically on reconnect, with its client-generated id, passing RLS? | Yes | **Fails →** investigate the payload/RLS or the reconnect listener before Phase 3. |
| **Q5** | Is a retried push idempotent (a duplicate-key `23505` treated as already applied)? | Yes | **Fails →** push via upsert or an RPC instead. |
| **Q6** | Does a pull bring in remote changes without clobbering local pending rows? | Yes | **Fails →** revisit the upsert guard (plan §4, rule 4). |

Also record the incidental observations in §6: layout under the status bar, back button, file picker, size and startup time.

---

## 2. What's on the branch

| Path | Purpose |
|---|---|
| `capacitor.config.ts` | App config. `appId` is the placeholder `com.expensesync.app` (plan, open decision 2). |
| `android/` | Generated Capacitor 8 project: minSdk 24, compile/target SDK 36. Generated web assets are git-ignored. |
| `vite.config.ts` | `vite build --mode capacitor` disables the PWA service worker. Web builds are unchanged. |
| `package.json` | Capacitor deps (`core`, `android`, `cli`, `network`, `community/sqlite`) plus a `build:android` script. |
| `src/spike/localDb.ts` | SQLite connection and schema (`expenses`, `outbox`, `meta`). |
| `src/spike/syncEngine.ts` | Offline create (row + outbox entry in one transaction), push (23505 recovery), pull (cursor with overlap, pending-wins guard). |
| `src/spike/sessionProbe.ts` | Reads the stored Supabase session; can backdate its expiry for Q3. |
| `src/spike/SpikePage.tsx` | The test harness at `/spike`. Deliberately **unprotected**, so it stays reachable when `useAuth()` loses the user. |
| `src/spike/SpikeLauncher.tsx` | A small **"Spike"** pill (bottom-left, native builds only). The app has no address bar, so this is how you reach `/spike`. |

**Already verified on the dev machine (no device available there):** strict `tsc` is clean across the app; ESLint is clean on the spike files; the web build still emits `sw.js` and registers it; the Capacitor build emits no service worker; `cap add android` detected both native plugins.
**Not yet verified:** everything on a device. That is what this runbook is for.

---

## 3. Prerequisites

- **Android Studio** (latest stable). It bundles the JDK. Install **SDK Platform 36** from the SDK Manager if prompted.
- **Node 22+** (required by the Capacitor 8 CLI), or **Bun**. The branch was set up with Bun, and `package-lock.json` is stale there (plan, open decision 3).
- An **emulator** (API 24+) or a **device with USB debugging** enabled.
- A **dedicated test tracker**, created in the web app first. Spike rows are real inserts into the production database: ₹1 debits in *Miscellaneous*, described `[spike] offline test HH:mm:ss`.
- Recommended: the web app open in a desktop browser on the same test tracker, to watch synced rows arrive in real time.

---

## 4. Build and run

```bash
git checkout spike/android-offline
npm install
npm run build:android
npx cap open android
```

Then press **Run ▶** in Android Studio.

- **Bun alternative:** `bun install --ignore-scripts`, then `bun run build:android`, then `bunx cap open android`. `--ignore-scripts` skips the native build of `canvas`, an optional `pdfjs-dist` dependency used only for rendering in Node, which fails on machines without C++ build tools. npm treats that failure as a warning.
- After changing web code, re-run `npm run build:android` and press Run again.
- **Debugging:** in desktop Chrome, open `chrome://inspect` and inspect the app's WebView to get the console, network and `localStorage`. Capacitor debug builds enable WebView debugging.
- **Handy adb commands:**
  - Force-stop: `adb shell am force-stop com.expensesync.app`
  - Airplane mode (Android 11+): `adb shell cmd connectivity airplane-mode enable` (or `disable`). The quick-settings toggle also works.

**One-time setup in the app:** sign in (online), tap the **Spike** pill, tap **Choose tracker**, pick the test tracker, then tap **Sync now** to pull its existing rows.

---

## 5. Scenarios

Each scenario lists steps, the expected result, and what to record. The harness status block shows `network`, `useAuth()`, `stored session`, local counts, and the target tracker. The **Log** section timestamps every event.

### A — SQLite works and survives a kill (Q1)
1. Online: tap **Sync now**. Note `local: N expenses`.
2. Force-stop the app, relaunch, and open **Spike**.

**Expected:** the same `N`, rows listed, target tracker still selected (it's stored in SQLite), and no `SQLite open failed` in the log.

### B — Session survives restart and reboot (Q2)
1. Signed in and online: force-stop, then relaunch.
2. Reboot the emulator/device, then relaunch.

**Expected:** both times the app opens on **Home** signed in, and Spike shows `useAuth(): signed in`.

### C — Offline cold start with an expired token (Q3)
1. Online and signed in, on Spike: tap **Expire stored token**, then **immediately** force-stop the app. If you wait, auto-refresh rewrites the token.
2. Turn on airplane mode and relaunch.
3. Record which screen it lands on (**Home**, or **Landing/Auth**). Then open Spike and record the `useAuth()` and `stored session` lines.
4. Still offline, tap **Add test expense**. It should queue anyway, using the stored-session fallback.
5. Turn airplane mode off. Watch for 30–60 s: supabase-js retries the refresh on a timer.
   - Record whether `useAuth()` returns to `signed in` on its own.
   - Record what the reconnect auto-sync does. If it runs **before** the session recovers, the push will likely fail with an RLS error, because the request goes out without a valid JWT. Once `useAuth()` recovers, tap **Sync now** and confirm the row drains.

**Hypothesis:** step 3 shows `NO USER` while `stored session` still has a refresh token, and the real app lands on Landing/Auth. Step 5 recovers. Any ordering problem between auth recovery and the push is itself a finding for Phase 3.

### D — Offline write, auto-sync on reconnect (Q4)
1. Online with a fresh session. Turn on airplane mode; the status should show `network: OFFLINE`.
2. Tap **Add test expense** twice.
   **Expected:** two amber `pending` rows, `outbox: 2`, no errors.
3. Force-stop and relaunch, **still offline**.
   **Expected:** both pending rows and both outbox entries survive (queue durability).
4. Turn airplane mode off.
   **Expected log:** `network → online`, then `[reconnect] push: 2 drained (0 already on server → 23505)`, then a pull line. Rows turn green `synced` and `outbox: 0`.
5. In the web app's test tracker: two `[spike] offline test …` ₹1 rows appear without a refresh (realtime). Their ids match the id prefixes shown in Spike, because the ids were generated on the device.

### E — Idempotent retry (Q5)
1. Online, after D: tap **Re-send last (23505)**. Expect `outbox: 1`.
2. Tap **Sync now**.

**Expected:** `push: 1 drained (1 already on server → 23505)`, `outbox: 0`, and **no duplicate** row in the web app.

### F — Pull without clobbering pending rows (Q6)
1. Online: add a transaction to the test tracker from the web app. On the device, tap **Sync now**. It appears as `synced`.
2. Turn on airplane mode. On the device, tap **Add test expense** (pending). In the web app, edit the transaction from step 1, e.g. change its description.
3. Turn airplane mode off. The auto-sync runs.

**Expected:** the pending row is pushed, the edited description is pulled, and nothing is duplicated. Pull counts may include rows already seen, because of the 5-minute overlap window; that's by design.

---

## 6. Observations to record

- **Status bar / notch:** does content render underneath it? Android 15+ enforces edge-to-edge. Safe-area handling is Phase 1 work, so note which screens are affected.
- **Back button:** do overlays (sheets, dialogs) close first, and does navigation behave?
- **Profile while offline:** `AuthContext` fetches `profiles` over the network on every auth event, so after an offline relaunch `profile` should be `null`. `AddExpenseSheet` refuses to save without it (`!user || !profile`), so the real Add Transaction button silently does nothing. Confirm this; it means Phase 2 must cache the profile locally.
- **Statement upload (online):** does the file picker open, and does a PDF parse end-to-end?
- **Cold-start time** and **APK size** (Build → Analyze APK).
- Any errors in the `chrome://inspect` console.

---

## 7. Cleanup

- Delete the `[spike] …` rows (₹1, *Miscellaneous*) from the test tracker, or delete the test tracker.
- Uninstall the app, or use Settings → Apps → ExpenseSync → Storage → Clear data, to wipe the local SQLite database.

---

## 8. Results

| # | Result (pass / fail / observed) | Notes | Plan impact |
|---|---|---|---|
| Q1 — SQLite durability | | | |
| Q2 — Session persistence | | | |
| Q3 — Offline cold start, expired token | | | |
| Q4 — Offline write → auto-sync | | | |
| Q5 — Idempotent retry | | | |
| Q6 — Pull vs pending rows | | | |
| Status bar / back button / upload | | | |

---

## 9. Known limitations of the harness (intentional)

- The local `expenses` table stores the server row as JSON. Phase 2 moves to explicit columns.
- Only **creates** are queued. Edits and deletes depend on the soft-delete decision (plan §5b).
- Push stops at the first failure: there's no transient-vs-permanent split, no poison-message handling, and no retry/backoff (plan §4, rule 5).
- Sync runs only on reconnect and manually. There's no app-resume or periodic trigger.
- One target tracker at a time.
- The branch isn't meant to merge as-is. It adds Capacitor deps with Bun, which leaves `package-lock.json` stale, and it carries throwaway `/spike` code.
