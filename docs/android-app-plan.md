# ExpenseSync Android App — Plan

**Status:** Phase 0 (spike) **complete** (2026-10-02); Phase 1 (wrapper) merged to `main`; Phase 2 (local reads) and Phase 3 (offline writes) **done** on `android/phase-2` and `android/phase-3` (2026-10-03). Spike results are in `docs/android-spike-runbook.md` §8 on branch `spike/android-offline`.
**Last updated:** 2026-10-03

---

## 1. Goals

1. An Android app with full feature parity with the current PWA.
2. Past transaction data is kept on the device, viewable offline, and refreshed when connectivity returns.
3. Transactions added while offline are queued on the device and synced to the central database (Supabase) once the device is back online.

**Non-goals for v1:** iOS (the approach keeps it open, but it isn't built), offline statement upload / AI parsing (inherently needs the network), push notifications.

---

## 2. Approach: wrap the existing app with Capacitor

| Option | Verdict |
|---|---|
| **Capacitor** (native Android shell around the existing Vite build) | ✅ **Chosen.** Reuses ~100% of the React/TS/Tailwind/shadcn code, the Sand & Ember design system, the gesture model and the upload pipeline. One codebase. Native access to SQLite, network status and file picking. iOS stays a cheap option later. |
| React Native | ❌ Rewrites every screen and throws away the UI layer. |
| Native Kotlin | ❌ Rewrites everything. |

Target version: **Capacitor 8** (8.5.x at time of writing). Its CLI requires **Node 22+**.

The app ships as an Android package whose WebView loads the bundled React app. The Supabase client, React Query and routing keep working as-is; the wrapper itself is a small piece of work. The substance of this project is making the app **offline-first**.

---

## 3. Target architecture

Today every read and write goes straight to Supabase (`src/hooks/useExpenses.ts`), so the app is unusable offline.

```
UI (unchanged React components)
      │
React Query ──reads──► Local SQLite ◄── source of truth on the device
      │                     ▲
  mutations                 │ sync engine (pull + push)
      │                     ▼
Outbox queue ──push──► Supabase Postgres (central DB, RLS still enforced)
```

- **Local store:** `@capacitor-community/sqlite`. Durable, survives app kills, and handles the data volumes (reads already paginate via `src/lib/fetchAllPages.ts`). Mirrors `expenses`, `categories`, `trackers` and `banks`, plus sync metadata.
- **Read path:** React Query `queryFn`s read from local SQLite instead of Supabase. Instant, and works offline. This is the largest refactor.
- **Write path (outbox pattern):** every create/update/delete writes to local SQLite *and* appends to an `outbox` table **in the same transaction**, so a crash can't leave a local change that never syncs. The UI updates immediately from local data.
- **Sync engine:** triggered on app start, network reconnect (`@capacitor/network`), app resume, and periodically while active.
  - **Push:** drain the outbox in order against Supabase using the user's JWT (RLS unchanged).
  - **Pull:** fetch rows changed since the last pull for the user's trackers and upsert them locally.
  - **Realtime:** remote changes arriving over the existing `postgres_changes` subscription are written to SQLite too.

No new backend is needed for the happy path.

---

## 4. Sync correctness rules

These are the rules that make offline sync safe. The Phase 0 spike prototypes 1–4.

1. **Client-generated IDs make pushes idempotent.** Every row created on the device gets `crypto.randomUUID()` at creation, so it has the same identity locally and remotely. A push is a plain insert. If it fails with a Postgres duplicate-key error (`23505`), an earlier attempt already landed and its response was lost in a dropped connection, so the push is treated as success. Retries never double-insert, and the realtime echo of our own insert dedupes by id.
2. **The server owns `updated_at`.** `expenses.updated_at` defaults to `now()` and a `BEFORE UPDATE` trigger bumps it. Pushes **never send it**, so pull cursors compare server timestamps only. Otherwise a device with a wrong clock, or a row created offline hours earlier, would slip behind another device's cursor and never be pulled.
3. **Pull with an overlap window.** `now()` is the *transaction start* time. A slow transaction can commit a row stamped earlier than a cursor another device has already advanced past. Each pull re-reads from `cursor − 5 min` and upserts by id, which is idempotent.
4. **Local pending changes win until pushed.** A pulled row never overwrites a local row that still has an unpushed change.
5. **Ordered outbox; transient and permanent failures handled differently.** A network failure stops the drain, preserves order, and retries later. Permanent failures must not block the queue forever: an RLS denial (the user was removed from the tracker) or an FK violation (the category was deleted) moves the entry to a "needs attention" state shown in the UI.
6. **"Connected" ≠ "reachable".** Android can report connected on a captive portal. A failed push is the real signal, not the OS flag.

---

## 5. Schema changes

### a. Client-generated UUIDs (app-side only)
`expenses.id` defaults to `gen_random_uuid()`, but the column already accepts an id on insert (`id?: string` in the generated types). The offline write path must supply one (rule 1). No migration needed.

### b. Soft delete (`deleted_at`) — the main decision
Deletes are currently hard (`.delete()` in `useExpenses.ts`). With a pure "pull rows changed since X" sync, a device can never *see* a deletion made elsewhere. The row is simply absent from the server, which looks the same as "not synced yet."

- **Recommended:** add `deleted_at timestamptz`. Deletes become updates, every device pulls the tombstone, and the local store hides `deleted_at IS NOT NULL`. The migration itself is trivial, but the read surface is wide:
  - every client query needs `.is('deleted_at', null)`;
  - the `get_tracker_stats` and `get_tracker_home_stats` RPCs must exclude soft-deleted rows, or totals will include deleted transactions;
  - Excel export and the duplicate check need the same filter;
  - a periodic purge job can hard-delete old tombstones.
- **Alternative (MVP):** keep hard deletes and run a periodic full resync per tracker to drop rows that no longer exist on the server. Simpler, but deletions propagate slowly and the resync gets expensive for large trackers.

---

## 6. What's already in our favor

- **Client-side aggregation exists.** `useTrackerHomeStats` already falls back to client-side math that mirrors `netOutgo.ts`, so Dashboard and Compare can run offline from local data without reimplementing the Postgres RPCs in SQLite.
- **Pagination exists** (`fetchAllPages`), so large trackers are handled in both the pull and the read layer.
- **The banks registry** (`useBanks` / `bankResolver`) works offline against a cached `banks` list. An entry whose bank isn't in the cache keeps its `bank_name` text locally and resolves `bank_id` at push time, which avoids a cross-table outbox dependency.
- **Realtime is already scoped per tracker**, which matches the per-tracker pull cursor.

---

## 7. Auth and session in the native shell

- **Google sign-in needs a native flow** (corrected after the spike; this section originally said email/password only). The web's `lovable.auth.signInWithOAuth` sends the page to Lovable's relative `/~oauth` broker, which the Capacitor shell serves from its local bundle as a 404, and Google blocks OAuth inside embedded WebViews anyway. The Android app instead uses **native Google sign-in**: Credential Manager via `@capgo/capacitor-social-login`, then `supabase.auth.signInWithIdToken`, with a hashed nonce. This requires Lovable Cloud's Google auth on *your own credentials*, plus Web and Android OAuth clients in one Google Cloud project; setup is in `docs/android-google-signin.md`. **Verified on the emulator:** sign-in matched the existing Google user, so no duplicate account was created. Email/password works unchanged. Apple sign-in was removed from the product on 2026-10-02.
- `src/integrations/supabase/client.ts` and `previewAuthStorage.ts` are **Lovable-generated (do not edit)**. Outside a Lovable preview iframe, which includes the Capacitor WebView (its host is `localhost`), session storage falls back to plain **`localStorage`**. On Android, WebView `localStorage` lives in the app's data directory and normally survives restarts, so the plan is to keep it and avoid touching the generated client. **Spike Q2 verifies this.** If it proves unreliable, the fallback is a Capacitor-Preferences-backed storage adapter. That would have to be coordinated with Lovable, because `client.ts` gets regenerated.
- **Session storage: confirmed fine (spike Q2).** WebView `localStorage` survived force-stop, app update and device reboot, so the generated client stays untouched. One caveat: the WebView writes `localStorage` to disk **lazily**. A write followed by a kill within about a second was lost in the spike, so a refresh-token rotation followed by an immediate kill could leave a stale refresh token on disk. Watch for unexpected sign-outs, and consider re-checking the session on resume.
- **Offline cold start with an expired access token: confirmed problem (spike Q3).** The app showed **"Loading…" for about a minute** while supabase-js retried the refresh, then reported *no session*, so `ProtectedRoute` would show the logged-out UI, although the refresh token was still stored. On reconnect supabase-js recovered the session by itself, and queued requests waited for the refresh, so there was no ordering failure. **Phase 2 must add an offline-authenticated state:** when offline, read the user from the stored session (with a short timeout instead of waiting for `INITIAL_SESSION`), let route guards show local-data screens, and switch to the real session once a refresh succeeds.
- **The profile is network-only.** `AuthContext` fetches `profiles` on every auth event, so an offline start shows "Good evening, there", and `AddExpenseSheet` refuses to save without `profile`. Phase 2 caches the profile locally.

---

## 8. What stays online-only in v1

| Feature | Why it needs the network | Offline behavior |
|---|---|---|
| Statement upload + AI parsing | Gemini via the `parse-statement` edge function | Entry point disabled with a clear message |
| Manual entry in a foreign currency | `convert-currency` edge function fetches rates | **Decision:** block, or save in the original currency and convert at push time |
| Invite / manage members | Server-side user lookup and admin RLS | Disabled |
| Create tracker / custom category | Could be outboxed, but adds ordering dependencies (expense → new category → new tracker) | Online-only in v1 |
| Delete account | Server-side cascade | Online-only |
| Category icon suggestions | Gemini | Existing client-side keyword fallback already works offline |
| Category learning writes | `category_learning` upsert | Skip offline (best effort today anyway), or outbox later |

Manual add/edit/delete of transactions and all viewing (lists, filters, search, Dashboard, Compare) work offline.

---

## 9. Conflict policy

- **Creates** never conflict (independent rows with client ids).
- **Edits to the same row** use **last-write-wins on the server's `updated_at`**. Because the server stamps the time, this effectively means *last to sync wins*: an offline edit made at 09:00 and synced at 18:00 overwrites an online edit made at 12:00. That's acceptable for v1. "Last edit wins" would need trusted client clocks, and surfacing conflicts in the UI can come later.
- **Delete vs edit** (with soft delete): newest `updated_at` wins.

---

## 10. Service worker in the native build

The `vite-plugin-pwa` service worker is redundant inside Capacitor, because assets are served from the app bundle. It can also cause the same stale-chunk class of bug fixed in `src/main.tsx` (`vite:preloadError`). The native build runs `vite build --mode capacitor`, which disables the plugin. The web/PWA build is unchanged.

---

## 11. Phased delivery

| Phase | Goal | Key output | Status |
|---|---|---|---|
| **0 — Spike** | De-risk the hard parts | SQLite in the WebView, session persistence, offline cold start, one offline write → sync round-trip with an idempotent retry, all on an emulator | **Done** (Q1, Q2, Q4, Q5 pass; Q3 confirmed problem; Q6 partial) |
| **1 — Wrapper** | App runs, online-only | Capacitor 8 + Android project committed, builds and runs, SW disabled in native build, app icon/splash, **plus from the spike:** native Google sign-in (already built on the spike branch), **Android back button → `history.back()`** via `@capacitor/app` (today BACK exits the app with a sheet open), **status-bar / safe-area handling** (content draws under the system bars), **toolchain pinned to JDK 21 + AGP 8.13** | **Done** on `android/phase-1` (verified on the API 37 emulator: insets, BACK closes overlays and minimises at `/`, native Google sign-in, adaptive icon + splash; JDK 21 pinned via `gradle-daemon-jvm.properties`) |
| **2 — Local reads** | View data offline | SQLite schema (explicit columns), pull engine, React Query `queryFn`s read local data, realtime writes local data, **offline-authenticated state** (Q3 confirmed), **local profile cache**, **error states instead of empty states** for failed loads | **Done** on `android/phase-2` (2026-10-03, emulator-verified): stale-while-revalidate reads from SQLite, incremental pull by `updated_at`, deletes caught by a per-tracker count check (no soft delete needed yet), offline auth (expired token offline → signed in, recovers on reconnect), cached profile, `LoadError` when never synced. Details: CLAUDE.md "ANDROID APP" |
| **3 — Offline writes** | Add/edit/delete while offline | Client UUIDs, outbox, push engine, reconnect/resume triggers (**offline → online transitions only**: `@capacitor/network` re-fires the same status every few seconds), pending-sync badges, offline banner, online-only features disabled offline | **Done** on `android/phase-3` (2026-10-03, emulator-verified): outbox + push engine, client UUIDs, rule 4 in pulls, pending/failed badges, sync status pill, online-only features gated; permanent push errors are marked and skipped (basic poison handling pulled forward from Phase 4). Details: CLAUDE.md "ANDROID APP" |
| **4 — Sync hardening** | Correctness | Soft-delete migration + query/RPC updates, poison-message handling, retry/backoff, LWW, offline duplicate check against local data | **Mostly done** on `android/phase-4` (2026-10-03): review sheet with retry/discard, fix-by-editing (folded into the failed insert), delete-wins policy with a notice, permanent errors skipped (Phase 3); offline duplicate check reads local (Phase 3). **Open:** soft delete (see §13.1) |
| **5 — Release** | Ship | Signing keystore, versioning, Play Store listing | — |

---

## 12. Risks

1. **Delete propagation** (§5b). Decide soft delete vs periodic resync early; it shapes Phase 4 and touches the RPCs.
2. **Read-layer refactor** (§3). Repointing every `queryFn` at SQLite is the bulk of the effort. The existing client-side aggregation reduces it.
3. **Offline cold start with an expired token** (§7). **Confirmed by the spike:** about a minute of "Loading…", then the logged-out UI. Fixed by Phase 2's offline-authenticated state.
4. **Session storage lives in a generated file** (§7). The spike showed no change is needed. Any future change still has to be coordinated with Lovable's generator.
7. **Lazy `localStorage` writes** (§7). A refresh-token rotation followed by an immediate kill could sign a user out. It's rare; monitor for it.
8. **Toolchain drift.** Android Studio bundles JDK 25 and pushes AGP 9, neither of which Capacitor 8's template supports yet. Pin JDK 21 + AGP 8.13, and revisit when Capacitor moves to AGP 9.
5. **Realtime vs local optimistic writes.** A realtime echo of a row the device just pushed must not double-apply. Dedupe by client UUID.
6. **Poison messages** (§4, rule 5). One permanently failing entry must not block everything queued behind it.

---

## 13. Open decisions

1. **Soft delete vs periodic resync** — recommend soft delete. *Phase 2 note:* reads don't need it. A per-tracker row-count check finds hard deletes and prunes them locally (a HEAD request per tracker, with an id fetch only on mismatch). Revisit in Phase 3–4, where offline edits make delete-vs-edit conflicts real.
2. ~~**Android `applicationId`**~~ — **Decided 2026-10-02: `com.expensesync.app`** (already on the Android OAuth client). It becomes the Play Store package name and can't change after the first release.
3. ~~**Package manager / lockfile**~~ — **Decided 2026-10-02: Bun.** `bun.lock` is the only lockfile (Lovable already updates it); `package-lock.json` and `bun.lockb` were removed on `android/phase-1`.
6. **Release signing for Google sign-in.** Every signing key that installs the app needs its SHA-1 on the Android OAuth client: each developer's debug key, the release keystore, and Play App Signing. Decide who holds the release keystore before Phase 5.
4. ~~**Offline foreign-currency entries**~~ — **Decided for v1: block** (Phase 3). Saving in a foreign currency offline shows a toast; converting at push time can come later.
5. **Offline creation of trackers / categories** — online-only in v1 (§8).
