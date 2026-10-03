# ExpenseSync — Engineering Reference

## PROJECT OVERVIEW

**ExpenseSync** is a production-grade, mobile-first collaborative expense tracking Progressive Web App. It features AI-powered bank statement parsing (Gemini, model configurable via the `GEMINI_MODEL` secret), real-time multi-user collaboration, category learning, multi-currency support, and Excel export. The app is fully functional and deployed.

The tracker page received a full visual + interaction revamp in May 2026 — "Sand & Ember" — moving from an indigo/violet palette + emoji icons to a warm cream/ink design with monoline Phosphor icons, gesture-driven cards, and an iOS-style grouped settings layout. The statement-upload pipeline was hardened with server-side chunking and a dedicated client-side merchant-extraction library. Later in May 2026 the codebase was tightened to TypeScript `strict: true`, lucide-react was retired from app code (still used inside vendored shadcn primitives), the device back gesture became overlay-aware, bank chips gained real logos with brand-color fallbacks, the Dashboard was simplified to a single net-outgo view, and a month-vs-month Compare sheet with drill-down was added.

---

## TECH STACK

| Layer | Technology |
|---|---|
| Framework | Vite 5.4 + React 18.3 + TypeScript 5.8 (SWC compiler) |
| UI | shadcn/ui + Tailwind CSS 3.4 + Radix UI primitives |
| State | TanStack React Query 5.83 + React Context API |
| Routing | React Router DOM 6.30 |
| Forms | React Hook Form 7.61 + Zod 3.25 |
| Database | Supabase PostgreSQL with Row Level Security |
| Real-time | Supabase Realtime (postgres_changes) |
| Auth | Supabase Auth — email/password + Google (web: Lovable Cloud OAuth broker; Android: native sign-in). Apple removed Oct 2026 |
| File Parsing | pdfjs-dist 4.0.379, PapaParse 5.5.3, XLSX 0.18.5 |
| AI | Gemini via Supabase Edge Functions — default `gemini-2.5-flash`, switchable with the `GEMINI_MODEL` secret |
| Charts | hand-rolled SVG sparkline (recharts dependency fully removed Jun 2026, incl. the unused `ui/chart.tsx`) |
| PWA | `vite-plugin-pwa` (autoUpdate) — manifest + Workbox service worker; precaches app shell, runtime-caches Google Fonts + bank favicons |
| Toasts | Sonner 1.7.4 |
| Icons | `@phosphor-icons/react` (regular weight — monoline) everywhere in app code; `lucide-react` remains only inside vendored shadcn `ui/*` primitives |
| Dates | date-fns 3.6.0 |
| Fonts | **Bricolage Grotesque** (display/headers), **Manrope** (UI body), **JetBrains Mono** (amounts) |

Dev server runs on `localhost:8080` via `bun run dev`.

**TypeScript strictness:** `strict: true` + `noImplicitAny: true` in both `tsconfig.json` and `tsconfig.app.json` (flipped May 2026). `tsc --noEmit` is clean — undeclared identifiers no longer slip through silently. Keep new code strict.

---

## ENVIRONMENT VARIABLES

**`.env.local`** (never committed):
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

**Supabase secrets** (set via `supabase secrets set`):
- `GEMINI_API_KEY` — used by `parse-statement` and `suggest-emojis` edge functions
- `GEMINI_MODEL` *(optional)* — Gemini model code for both functions, e.g. `gemini-3.1-flash-lite`. Unset = `gemini-2.5-flash`. Change it (or roll back) without a code deploy; the functions log `model=… thinking=…` on cold start so you can confirm what's live.
- `GEMINI_THINKING_LEVEL` *(optional)* — `MINIMAL` | `LOW` | `MEDIUM` | `HIGH`, applied only to models that can't turn thinking off (see parse-statement below). Unset = `LOW`.

---

## PROJECT STRUCTURE

```
ledger-friends/
├── src/
│   ├── pages/                                # 7 pages
│   │   ├── Auth.tsx
│   │   ├── Home.tsx                          # Greeting + tracker cards + FloatingAdd
│   │   ├── Landing.tsx
│   │   ├── TrackerDetail.tsx                 # Top bar + sticky TabBar + 3 tabs
│   │   ├── UploadStatement.tsx               # 4-step upload + merchant-extraction pipeline
│   │   ├── Profile.tsx
│   │   └── NotFound.tsx
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── AppContext.tsx
│   │
│   ├── hooks/
│   │   ├── useExpenses.ts                    # CRUD + bulk + realtime + duplicate + suspected-transfers (incl. pair matching)
│   │   ├── useBanks.ts                       # Bank registry query + find-or-create resolver
│   │   ├── useTrackers.ts
│   │   ├── useTransactionTypeFilter.ts       # URL + localStorage synced
│   │   ├── useNudge.ts
│   │   ├── useMonthSwipe.ts                  # Horizontal-swipe month nav + adjacentMonths(months, current)
│   │   ├── useOverlayBack.ts                 # Module-level stack + popstate listener; drives back-closes-overlay
│   │   └── use-mobile.tsx
│   │
│   ├── components/
│   │   ├── BottomNav.tsx                     # 3-tab: Home / Trackers / You
│   │   ├── FloatingAdd.tsx                   # Ember ember FAB (on Home + Expenses)
│   │   ├── CategoryDot.tsx                   # Colored disc + Phosphor line icon
│   │   ├── CategoryIcon.tsx                  # Phosphor regular weight render
│   │   ├── BankBadge.tsx                     # Real bank logo via Google favicons + brand-color monogram fallback
│   │   ├── LoadError.tsx                     # Failed/offline-paused query state (full + compact) — use instead of empty states when a load fails
│   │   ├── PaymentBadge.tsx                  # Per-method Phosphor icon + tinted disc
│   │   ├── Nudge.tsx
│   │   ├── NavLink.tsx
│   │   ├── tracker/
│   │   │   ├── TrackerTopBar.tsx             # Sticky top: back · name · upload (publishes height to --tracker-topbar-h)
│   │   │   ├── TrackerTabBar.tsx             # Sticky at top:var(--tracker-topbar-h), dark-pill active
│   │   │   ├── HeroSummary.tsx               # Dark ink card: Net Outgo + In + Net Savings (Transactions tab)
│   │   │   ├── TrackerToolBar.tsx            # Ink-pill month dropdown + sort + filter + transfer-review
│   │   │   ├── TypeSegment.tsx               # All / Out / In segmented control (Transactions tab only)
│   │   │   ├── DayHeader.tsx                 # Day/category/amount-sort group header
│   │   │   ├── TxnRow.tsx                    # Letter-receipt card with gestures
│   │   │   ├── FilterSheet.tsx               # Bottom sheet: People → Banks → Payment Modes → Categories
│   │   │   ├── ExpensesTab.tsx               # Owns the list, gestures, multi-select
│   │   │   ├── DashboardTab.tsx              # Light hero (cream) + "where it went" + "biggest" + Compare
│   │   │   ├── SettingsTab.tsx               # iOS-style grouped lists + danger zone
│   │   │   ├── AddExpenseSheet.tsx           # Manual create/edit with optional Merchant field
│   │   │   ├── CompareSheet.tsx              # Month-A vs Month-B comparison + per-row drill-down
│   │   │   ├── MonthNavChevrons.tsx          # Subtle left/right hints on hero cards
│   │   │   ├── TransferReviewModal.tsx       # Ember-styled popup
│   │   │   └── TransferReviewSheet.tsx       # Bottom-sheet review with tri-state controls + Pair chip
│   │   └── ui/                               # shadcn/ui primitives (Root wrappers add useOverlayBack)
│   │
│   ├── lib/
│   │   ├── categoryLearning.ts               # AI category memory
│   │   ├── currencies.ts                     # 10-currency + formatAmount + formatAmountShort
│   │   ├── transferDetector.ts               # Internal-transfer keyword detection
│   │   ├── merchantDictionary.ts             # Curated merchant→category rules
│   │   ├── merchantExtraction.ts             # Merchant/description normalisation pipeline
│   │   ├── bankBrand.ts                      # Hardcoded domain/brand-color fallback map + Google favicon URL builder + monogram
│   │   ├── bankResolver.ts                   # normalizeBankKey() + findBankMatch() — resolves free text against the `banks` registry (exact/alias/fuzzy)
│   │   ├── stringSimilarity.ts               # Shared Levenshtein similarity() (category matching + bank matching)
│   │   ├── paymentMethodMeta.ts              # Payment method → Phosphor icon + tinted color
│   │   ├── phosphorIcons.ts                  # Icon name → Phosphor component map + heuristic picker
│   │   ├── nativeShell.ts                    # Android only: back button → history.back() (lazy-loaded from main.tsx)
│   │   ├── nativeGoogleAuth.ts               # Android only: Credential Manager → signInWithIdToken (lazy-loaded from Auth.tsx)
│   │   ├── platform.ts                       # isNativeApp (Capacitor.isNativePlatform())
│   │   ├── storedSession.ts                  # Reads/clears the persisted Supabase session (Android offline auth)
│   │   ├── local/                            # Android only: SQLite store — db.ts, sync.ts (pull engine), reads.ts, state.ts (see ANDROID APP)
│   │   └── utils.ts
│   │
│   ├── types/
│   │   └── index.ts                          # Expense, DraftExpense, Tracker, …
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts                         # Lovable-generated — do not edit
│   │   ├── previewAuthStorage.ts             # Lovable-generated — session storage (localStorage; brokered inside Lovable preview iframes)
│   │   └── types.ts                          # Generated DB types (hand-edited for raw_description + rejected_as_transfer)
│   │
│   ├── integrations/lovable/
│   │   └── index.ts                          # Lovable-generated — Google OAuth via the /~oauth broker (web only)
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                             # Sand & Ember CSS vars + utilities
│
├── supabase/
│   ├── migrations/                           # 21 migration files
│   └── functions/
│       ├── parse-statement/                  # Statement → transactions (chunked)
│       ├── convert-currency/
│       ├── delete-account/
│       └── suggest-emojis/
│
├── docs/
│   ├── android-app-plan.md                   # Android app plan (Capacitor + offline-first sync) — Phase 0 results folded in
│   └── android-google-signin.md              # Own Google OAuth credentials (web + Android) — setup & troubleshooting
│
├── android/                                  # Capacitor Android project (committed; build/ and copied web assets are ignored)
├── public/                                   # Static assets
├── capacitor.config.ts                       # appId com.expensesync.app, webDir dist, SystemBars style
├── .env.capacitor                            # Google Web OAuth client ID for the native build (public)
├── vite.config.ts                            # SWC + lovable-tagger, port 8080; `--mode capacitor` = native build
├── tailwind.config.ts                        # Sand & Ember tokens + display/sans/mono fonts
├── tsconfig.json / tsconfig.app.json         # strict: true + noImplicitAny: true (use `tsc --noEmit -p tsconfig.app.json`)
└── package.json
```

---

## ROUTES

| Path | Component | Auth | Description |
|---|---|---|---|
| `/` | `HomeOrLanding` | Conditional | Shows `Home` if authenticated, `Landing` otherwise |
| `/auth` | `Auth` | Redirect if logged in | Sign in / Sign up |
| `/tracker/:trackerId` | `TrackerDetail` | Protected | Main tracker page (tabs: expenses, dashboard, settings) |
| `/tracker/:trackerId/upload` | `UploadStatement` | Protected | 4-step statement upload wizard |
| `/profile` | `Profile` | Protected | User profile + account management |
| `*` | `NotFound` | None | 404 page |

Route guards (`ProtectedRoute`, `AuthRoute`, `HomeOrLanding`) live in `App.tsx`.

**Code splitting (Jun 2026):** all 7 pages are `React.lazy` routes behind a `Suspense` fallback in `App.tsx`, and `xlsx` is dynamically imported at its three call sites (SettingsTab/Profile export, UploadStatement parse) — keep it out of static imports. `pdfjs-dist` was already dynamic. Entry bundle dropped from ~1.7 MB (499 KB gzip) to ~484 KB (146 KB gzip).

---

## DATABASE SCHEMA

### Tables

**profiles** — Auto-created on signup via Postgres trigger.
- `id` (UUID PK, FK to auth.users), `full_name`, `avatar_url`, `email`, `created_at`

**trackers**
- `id`, `name`, `currency` (ISO code), `admin_id` (FK profiles), `created_at`, `updated_at`

**tracker_members**
- `id`, `tracker_id`, `user_id`, `role` ('admin' | 'member'), `joined_at`
- Unique constraint on (tracker_id, user_id)

**categories**
- `id`, `tracker_id` (FK, null for system), `name`, `icon` (Phosphor icon name string — NOT emoji), `color` (hex), `is_system`, `created_by`, `created_at`
- 19 system debit + 6 system credit categories seeded
- **Important:** the `icon` column has stored Phosphor icon-name strings (`ForkKnife`, `Coffee`, `Car`, …) since migration `20260410_update_system_category_icons.sql`. Old code that treated `icon` as emoji has been removed.

**expenses**
- `id`, `tracker_id`, `created_by_id` (nullable), `created_by_name` (denormalised)
- `category_id`, `amount`, `currency`, `date`
- `description` (cleaned, human-readable phrase), `merchant_name` (normalised brand/payee), **`raw_description`** (verbatim original narration — NEW)
- `payment_method`, `bank_name` (denormalised cache of `banks.canonical_name`), `bank_id` (FK → `banks`), `notes`, `tags` (text[]), `reference_number`
- `is_debit`, `source` ('manual' | 'statement_upload'), `is_transfer`, `suspected_transfer`, `rejected_as_transfer`
- `original_amount`, `original_currency`, `conversion_rate`, `conversion_note`
- `created_at`, `updated_at` (auto-updated via trigger)

**category_learning**
- `id`, `normalized_description` (unique), `merchant_name`, `category_id`, `applied_count`, `updated_at`

**banks** (added `20260721120000_add_banks_registry.sql`)
- `id`, `canonical_name` (unique), `aliases` (text[]), `domain` (feeds the Google favicon lookup), `brand_color`, `created_at`, `updated_at`
- Global reference registry, same RLS shape as `category_learning` (any authenticated user reads/inserts/updates, nobody deletes from app code)
- Seeded from the banks previously hardcoded in `bankBrand.ts`'s `DOMAIN_MAP`/`BRAND_COLOR`; existing `expenses.bank_name` values were backfilled to `bank_id` by matching against `canonical_name`/`aliases` via the `normalize_bank_name()` SQL function (strips legal suffixes like "Private Limited" then a trailing "bank")
- All write paths (`UploadStatement.tsx` save, `AddExpenseSheet.tsx` save) resolve free-text bank input through `useResolveBankName()` (exact/alias/fuzzy match via `bankResolver.ts`, else insert a new row) before writing `bank_id` + the canonical `bank_name`, so "HDFC Bank" and "HDFC Bank Private Limited" always collapse to one row instead of fragmenting filters/autocomplete

### RLS Policies
- Tracker-scoped data is restricted by tracker membership
- **`profiles` SELECT** is scoped to self + users who share a tracker with the caller (tightened May 26 2026 — was previously any authenticated user). Stops user enumeration.
- System categories readable by all authenticated users
- Only admins update/delete trackers and manage members
- **`tracker_members` INSERT** is admin-only. The creator's admin row is auto-added by the `add_tracker_admin_member` `SECURITY DEFINER` trigger on `trackers` INSERT — `useCreateTracker` no longer inserts a member row.
- EXECUTE on internal `SECURITY DEFINER` helpers (`is_tracker_member`, `is_tracker_admin`, `get_tracker_stats`, `handle_new_user`, `update_updated_at_column`, `add_tracker_admin_member`) is revoked from `anon`/`public`; only `authenticated` retains the three callable from app code.
- Expense edit/delete: creator OR tracker admin
- **UPDATE policies carry explicit `WITH CHECK` (hardened Jun 3 2026).** `expenses` UPDATE: `USING` = creator-or-admin (which existing rows you may touch); `WITH CHECK` = `is_tracker_member(uid, tracker_id) AND (creator OR admin)` re-verified against the **new** row. `categories` UPDATE: `WITH CHECK` re-asserts `tracker_id IS NOT NULL AND is_tracker_member(uid, tracker_id)`. Without an explicit `WITH CHECK`, Postgres reuses the `USING` clause for the new row — and since `created_by_id = uid` stays true when you only change `tracker_id`, a creator could move a row into a tracker they don't belong to. The new-row membership check blocks that. Legitimate bulk-Move (`useBulkMoveExpenses`) still passes — its targets come from the user's own `useTrackers` list.
- Category learning is globally shared

### Realtime
- `expenses` table is published to `supabase_realtime`
- Client subscribes per tracker: `postgres_changes` on `expenses` filtered by `tracker_id`

### RPC Functions
- `get_tracker_stats` — Returns trackers with member_count, monthly_total, date_range
- `get_tracker_home_stats` — One row per (tracker, month): net_expense + txn_count, membership enforced via auth.uid() inside the SECURITY DEFINER body (no user param). Mirrors the netOutgo.ts math (per-category GREATEST(outgo−inflow,0) per month). `useTrackerHomeStats` consumes it and falls back to client-side aggregation on PGRST202 if the migration isn't applied.

---

## EDGE FUNCTIONS (4)

**All edge functions are JWT-gated** (as of May 26 2026). Each function calls `supa.auth.getUser()` on the bound `Authorization` header and returns 401 to unauthenticated callers. Anonymous invocation of `parse-statement` / `convert-currency` / `suggest-emojis` is no longer possible — protects Gemini token budget.

### parse-statement
- **Purpose:** Extract and categorize transactions from bank/credit-card statement text.
- **AI Model:** `GEMINI_MODEL` secret, default `gemini-2.5-flash` (structured output via `responseSchema`). Google now lists 2.5 Flash as limited-access for existing users, so a new GCP project/key may need a 3.x model.
- **Thinking must be off or minimised on every Gemini call** — thinking tokens are billed as output and count against `maxOutputTokens`, and left unchecked they cause structured-output workflows to return empty/truncated JSON on moderately-sized inputs. Every call passes the shared `THINKING_CONFIG`: Gemini 2.x Flash/Flash-Lite get `thinkingBudget: 0` (fully off); every other model (3.x, 2.5 Pro) can't disable thinking, so gets `thinkingLevel: LOW` — the lowest level every 3.x Flash accepts (3.7/3.8 Flash reject `MINIMAL`) — overridable via `GEMINI_THINKING_LEVEL`. For those models `outputTokenCap()` adds 4,096 tokens of headroom to each call's limit. The transactions call's base limit is `maxOutputTokens: 32_768` (headroom for ~100+ structured rows). The model/thinking block is duplicated in `suggest-emojis/index.ts` (no `_shared/` folder, to keep Lovable's per-function deploys simple) — keep the two in sync.
- **Per-chunk retry:** if a chunk fails (Gemini 5xx, malformed JSON, early `finishReason` like MAX_TOKENS/SAFETY), the server retries it once before giving up. The client also retries the whole edge-function call once on `error` before throwing `ParseServiceError`.
- **Modes (selected via `body.mode`):**
  - `'metadata'` — cheap first pass: returns `{ statement_type, bank_name, base_currency, debit_credit_rule, column_semantics }`. Called once per upload from the client to prime the parsing pass.
  - `'emojis'` — suggests Phosphor icon names for new category names.
  - Default — parses transactions.
- **Server-side chunking** (default mode): if `extractedText.length > 25_000` chars, the function splits on line boundaries into ~25k chunks with a 200-char overlap (snapped to line boundary). Chunks run **serially** (`CONCURRENCY = 1`) via a bounded pool; per-call timeout 45s with an overall response deadline of 125s. The large chunk size + serial execution is deliberate: a typical 3–4 page statement becomes a **single Gemini call**, keeping free-tier requests-per-minute usage minimal. Each chunk runs its own retry/backoff loop (up to `MAX_CHUNK_ATTEMPTS = 4`) that, on a 429, honours Gemini's suggested `retryDelay` (or exponential backoff 2s→16s, capped) before retrying — so transient free-tier throttles self-heal within the request.
- **Rate-limit signalling:** when *every* chunk fails with a 429, the function returns **HTTP 200** with `{ transactions: [], rateLimited: true, error }` (not 504) — because supabase-js only exposes the response body on a 2xx. The client (`UploadStatement.tsx`) detects `data.rateLimited`, throws a `RateLimitError`, shows a "wait a minute and try again" toast, and returns the user to the analyse step **without clearing the file**. The `metadata` mode also degrades to `{ statement_type: 'unknown', … }` (HTTP 200) on any Gemini error instead of returning 502, since it's an optional priming pass.
- **Partial-success path:** a chunk's failure no longer aborts the whole call. The error is collected in a `warnings: string[]` array and the function returns whatever the surviving chunks produced. Only when *every* chunk fails does the function return 504. The client surfaces `warnings` via `toast.warning` so the user knows to review for missing rows.
- **Server-side dedupe** on `(date, amount, is_debit, normalised raw_description)` removes overlap-induced duplicates.
- **Field contract (per transaction):**
  - `raw_description` — verbatim narration, never cleaned.
  - `merchant_name` — REQUIRED when a counterparty is identifiable; proper-cased; max 40 chars; strips channel prefixes (UPI/POS/NEFT/IMPS/RTGS/REF/…), UPI handles, order/reference IDs, corporate suffixes (Pvt/Ltd/Limited/Inc/Corp). For CC bill payments, use the issuing bank ("HDFC CC"). Omitted only for true no-counterparty rows (ATM, interest credit).
  - `description` — short HUMAN phrase about WHAT (max 60 chars). Never duplicates `merchant_name`. If no extra context exists, falls back to a type label: "UPI payment", "Card purchase", "POS purchase", "NEFT transfer", "Auto-debit", "Cash withdrawal", "Refund", "Salary credit", "Interest credit", "Bill payment".
  - `raw_amount_text` — original amount cell exactly as it appeared (sign / currency marker / Dr-Cr suffix preserved). Used by the client for cross-validation.
  - Plus: `date`, `amount` (positive), `is_debit`, `category`, `confidence`, `currency`, `is_likely_transfer`, `payment_mode`, `bank_name`, `reference_number`, `balance`.
- **Intra-chunk consistency** rule: same merchant in multiple rows must produce the identical `merchant_name` string in every row.

### convert-currency
- Bulk-converts expense amounts when tracker currency changes.

### delete-account
- Cascade deletes a user account and all related data.

### suggest-emojis
- Despite the legacy name, returns Phosphor icon name suggestions for a category name. Falls back to client-side keyword matching if Gemini is unavailable.

---

## TYPESCRIPT TYPES

Key types in `src/types/index.ts`:

```typescript
type UserRole = 'admin' | 'member';
type ExpenseSource = 'manual' | 'statement_upload';
type PaymentMethod = 'UPI' | 'Credit Card' | 'Debit Card' | 'Online' | 'Cash' | 'Other';
type ReviewStatus = 'pending' | 'approved' | 'discarded';

interface Expense {
  // …existing fields…
  description: string;
  raw_description?: string;        // original statement narration
  merchant_name?: string;
  is_transfer: boolean;            // user-confirmed YES
  suspected_transfer: boolean;     // heuristic / keyword flag
  rejected_as_transfer: boolean;   // user-confirmed NO (mirror of is_transfer)
  // …
}

interface DraftExpense {
  // …
  description: string;
  raw_description?: string;     // preserved through review
  merchant_name?: string;
  // …
}
```

**Casting tip:** strict mode catches missing fields and undeclared identifiers at compile time. For literal union types (e.g. `PaymentMethod`), cast explicitly (`value as PaymentMethod`) when narrowing a `string` from an input — `tsc` will require it. Always run `npx tsc --noEmit -p tsconfig.app.json`; the root `tsconfig.json` has `files: []` and silently compiles nothing.

---

## KEY FEATURES & USER FLOWS

### Authentication
- **Email/password:** two-tab UI (`supabase.auth.signInWithPassword()` / `supabase.auth.signUp()`), profile auto-created via trigger, state via `AuthContext`.
- **Google (web):** "Continue with Google" calls `lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })` from the **Lovable-generated** `src/integrations/lovable/index.ts` (`@lovable.dev/cloud-auth-js`, do not edit). It navigates to Lovable's **relative** `/~oauth/initiate` broker, which is why `vite.config.ts` keeps `/~oauth` out of the service worker. The broker returns tokens that are passed to `supabase.auth.setSession()`.
- **Google OAuth credentials:** since 2026-10-02 Lovable Cloud uses **your own credentials** (Cloud → Users → Auth settings → Google), not Lovable's managed client. A Web client and an Android client live in one Google Cloud project, and the consent screen is published to Production. Existing users kept their accounts, because Google's `sub` is stable across OAuth clients. Setup and troubleshooting: `docs/android-google-signin.md`.
- **Google (Android):** the web broker can't work inside the Capacitor shell (the relative path resolves to the local bundle, and Google blocks OAuth in embedded WebViews), so the Android app uses **native** sign-in instead: Credential Manager via `@capgo/capacitor-social-login`, then `supabase.auth.signInWithIdToken` with a hashed nonce. `Auth.tsx` picks it when `Capacitor.isNativePlatform()` (`src/lib/nativeGoogleAuth.ts`); see **Android app** below.
- **Apple sign-in** was removed on 2026-10-02.
- `src/integrations/supabase/client.ts` and `previewAuthStorage.ts` are also Lovable-generated. Session storage is `localStorage`, except inside a Lovable preview iframe, where it's brokered to the editor.

### Home Page (bento layout, Jun 2026)
- Greeting based on time of day + first name
- **Bento tiles**: up to 3 pinned trackers (`usePinnedTrackers`, pin order matters). 1 pin = full-width hero tile (tinted per-tracker color, net expense, sparkline, member/since meta); 2–3 pins = hero (first pin) at 1.5fr + compact amount-only sidekick tiles stacked right. 0 pins = dashed hint card.
- **Tracker list**: ALL trackers (pinned included), sorted by most recent transaction (`date_range.max` desc from `get_tracker_stats`), each row showing net expense · member count, a last-activity label (Today/Yesterday/EEE/d MMM/MMM 'yy) and a PushPin toggle (ember fill = pinned; max 3 enforced with a toast).
- Pins persist in `profiles.pinned_tracker_ids uuid[]` (migration #24) and mirror to localStorage (`expensesync-pinned-trackers`) so the feature works before the migration is applied (PGRST204 ignored on write).
- The old "Net expense · all trackers" summary hero was removed in favour of the bento.
- `FloatingAdd` ember FAB (bottom-right, above BottomNav) opens the Create Tracker sheet
- BottomNav (`Home / Trackers / You`) at bottom — Trackers deep-links to `activeTrackerId` when set

### Tracker Detail
A `/tracker/:id` page with **two sticky bars at the top**: `TrackerTopBar` (back · tracker name + member dot · upload) sticks at `top: 0`, and `TrackerTabBar` (Transactions / Dashboard / Settings, dark-pill active state) sticks at `top: var(--tracker-topbar-h)`. TrackerTopBar measures itself with a `ResizeObserver` and publishes its height to `--tracker-topbar-h` on `<html>`; the TabBar consumes that variable with a 57px fallback. Both have `bg-background/95 backdrop-blur-md` so content scrolls translucent underneath.

**Expenses Tab:**
- `HeroSummary` dark ink card: big label "Net outgo this month", big number = total month debits, sub-chips "Total In" (credits) and "Net Savings" (In − Out, signed and color-tinted green/coral). All three values are filter-aware: the `Out` filter zeros earn; the `In` filter zeros spend. `MonthNavChevrons` sit inside the card at the left/right edges (dark tone, low opacity) and disappear at boundaries.
- `TrackerToolBar` (Transactions tab only): ink-pill month dropdown (matches the active TabBar style so the current month reads as a primary selection) · transfer-review button (warn-coloured with count badge) · search button (toggles an inline search row below the toolbar; matches description/merchant/raw_description/notes/bank_name client-side, ember-highlighted while active) · sort button · filter button (with badge). Horizontal swipe on the tab body also steps months via `useMonthSwipe`, bounded — no wrap.
- `TypeSegment`: All / Out / In segmented control — replaces the old `TransactionTypeFilter`.
- Day group headers show net delta `+₹X` / `−₹X` color-coded.
- `TxnRow` letter-receipt cards (see gesture model below).
- `FilterSheet` bottom sheet: **People → Banks → Payment Modes → Categories**, each multi-select. Banks and Payment Modes include an "Unspecified" chip when at least one row in the current view has no value for that field (matched via the exported `UNSPECIFIED` sentinel). Bank chips show the real brand favicon via `BankBadge` (Google's `s2/favicons` endpoint; Clearbit's free CDN retired in late 2024) with an `onError` fallback to a brand-color monogram disc — `bankBrandColor(name)` looks up a curated primary color (HDFC `#004C8F`, ICICI `#F38B23`, Axis `#97144D`, …) and falls back to a hashed palette pick for unknown banks. Payment chips use `PaymentBadge` (per-method Phosphor icon + tinted disc — UPI=violet/QrCode, Credit=blue, Debit=teal, Cash=amber, etc.). Ember "Show N matching" CTA. Filter applied client-side.
- Multi-select: dark header at top + floating action bar bottom-anchored with Category / Move / Delete.
- Sort UI: see "Sort UI" section below.
- `FloatingAdd` opens `AddExpenseSheet`.
- Realtime subscription invalidates the query on changes.

**Dashboard Tab:**
- No toolbar, no All/Out/In segment. Month navigation is purely `MonthNavChevrons` (subtle left/right hints on the hero edges) + horizontal swipe (`useMonthSwipe`). The page is outgo-centric — there is no Type filter.
- Hero is a **cream `bg-card` surface** (not the dark ink treatment used on Transactions) so it visually rhymes with "Where it went" and "Biggest" below. Layout: big "Net outgo this month" total, pct-change chip vs previous month using `--spend-bg`/`--earn-bg` tokens, avg/day + transaction count, ember sparkline (daily debits), and `Total In` + `Net Savings` sub-chips on `bg-surface-alt`. The month indicator at top-right is an **ember-tinted pill** (`bg-ember/12 text-ember` with calendar icon) so it reads as a primary anchor on the lighter card.
- "Where it went": stacked-share bar across the top, then a debit-only category list. Each row shows `CategoryDot`, name, count, percentage, mono amount, and MoM change (red for up = more spend, green for down). Tap a row to jump to Transactions tab with the category filter pre-applied.
- "Biggest this month" list (top 5 debits).
- Compare button opens `CompareSheet`. The sheet pairs the current month (A) against a selectable month (B), with short inline labels in **MMM'YY** form (e.g. `Apr'26`, `Mar'26`) on every bar. Tap any category row to expand inline drill-down buttons — `Open Apr'26` / `Open Mar'26` — tapping either navigates to Transactions with that month + the category filter pre-applied. Months with zero spend in the row get a disabled button.

**Settings Tab:**
- Tracker header card (ember home icon, name, currency · members · since)
- Members grouped list (initial avatar with category-colored background, role, ellipsis-menu with Promote/Demote/Remove, ember "Invite by email" footer row)
- Categories chip-cloud (custom chips + dashed-ember "Add" chip), collapsible System section, "Auto-assign icons" button (regenerates icons for custom categories using client-side keyword matching, falls back through `suggest-emojis` for missed names)
- iOS-style grouped Preferences (Default view, Currency, Export, Notifications). Notifications is a placeholder.
- Danger Zone separated with spend-red border, contains delete-tracker (admin) or leave-tracker (member) with a 3-second countdown on the destructive action.

### Statement Upload (4-Step Wizard) — `UploadStatement.tsx`
1. **File Select:** Drop zone, accepts PDF/CSV/XLSX/XLS, max 10MB.
2. **PDF Password:** Optional password entry (only for PDF files).
3. **Processing:**
   - Client-side text extraction (pdfjs / Papa / XLSX), chunked: 6 pages / 80 rows / chunk (bumped up from 2/40 — most small/medium statements now travel in a single edge-function call; the server's own chunker handles further splitting)
   - Cheap `mode: 'metadata'` call to determine bank, statement_type, currency, debit-credit rule
   - Per-chunk `parse-statement` calls with header injection (statement header is repeated as context on every chunk after the first)
   - **Merchant + description resolution pipeline** (see "Merchant / description pipeline" below)
   - Balance reconciliation: rows whose `balance` doesn't match `prev ± amount` get flagged for review
   - Intra-batch merchant canonicalisation via `canonicalizeMerchants`
   - Client-side learned-category lookup → `merchantDictionary` lookup → AI suggestion fallback
   - Duplicate check against existing tracker expenses
   - Server-side `warnings` (if any) surfaced via `toast.warning`
4. **Review:** review header shows a `BankBadge` + statement bank name (pre-filled from the AI metadata pass, falls back to the most-frequent per-row `bank_name` across drafts, editable inline) and a Total Out / Total In / Net summary card. Three accordion sections follow — Potential Duplicates / Needs Review / Ready to Save. Bulk insert on save. **On save, the confirmed statement bank overrides `bank_name` on every approved draft** — every row in a single statement belongs to the same bank, so the per-row AI guess is discarded in favour of the user-confirmed value. Category corrections write to `category_learning`.

The Statement Upload step machine is dynamic: 1 = file select, 2 = password (PDF only, when the file is actually locked — detected by attempting to open without one), 3 = page-preview (PDF only — 2-column thumbnail grid where the user deselects ads/T&Cs pages before AI parsing), 4 = processing, 5 = review. The displayed "Step X of N" reflects only the steps that actually run.

### Merchant / description pipeline (client-side)

Lives in `src/lib/merchantExtraction.ts`. All pure functions, applied during the AI-path draft build and the bulk-CSV path:

| Helper | Purpose |
|---|---|
| `normalizeMerchant(raw)` | Trim, strip channel prefixes (UPI/POS/NEFT/IMPS/RTGS/REF/…), UPI handles, corporate suffixes (Pvt/Ltd/Inc/Corp), trailing digit blocks. Title-case. Cap at 40 chars. |
| `extractMerchantFromRaw(rawDesc)` | When AI omits `merchant_name`: run `normalizeMerchant` on `raw_description` and keep the first 3 meaningful tokens. |
| `genericDescription({paymentMethod, isDebit, categoryName, isTransfer})` | Returns "UPI payment", "Card purchase", "Salary credit", "Cash withdrawal", etc. — used when description is empty or equals merchant. |
| `resolveDescription({…})` | Trim AI description, strip leading channel prefixes if merchant is known, fall back to `genericDescription` when empty/duplicate-of-merchant. Cap at 80 chars. |
| `canonicalizeMerchants(rows)` | Cluster merchant_names by lowercased 6-char prefix, pick the cleanest most-frequent surface form per cluster, rewrite all rows in that cluster to the winner. |

The previous **25-char hard truncation of description was removed** — descriptions now keep their full text and rely on CSS-ellipsis at the card level. `raw_description` is preserved on every draft and persists to the DB column.

### Overlay back-button handling

Every controlled overlay (Sheet / AlertDialog / Dialog / Popover) closes on the device back gesture / browser back instead of navigating the underlying page. Implemented in `useOverlayBack` (a module-level stack + a single `popstate` listener) and applied transparently inside the four Radix Root wrappers in `src/components/ui/{sheet,popover,alert-dialog,dialog}.tsx`. Stacked overlays close one layer at a time (inner first). pushState is called without a URL argument so React Router never sees a navigation.

### Gesture model (TxnRow)

Each card owns its own pointer handling. Thresholds:
- `TAP_MAX_MOVE = 8px`, `TAP_MAX_TIME = 250ms`
- `SCROLL_LOCK_Y = 12px`
- `SWIPE_THRESHOLD = 40%` of card width
- `SWIPE_VISUAL_CAP = 140px`

Behaviour:
- **Tap** (down→up, ≤8px movement, ≤250ms): opens edit modal — `canModify` only. In multi-select mode, taps toggle selection.
- **Long-press 500ms**: enters multi-select mode (notifies parent via `onLongPressStart`).
- **Horizontal swipe** ≥ 40% of card width: card slides with the finger up to ±140px, snaps back, and **deletes immediately** — no confirm dialog. The row is optimistically removed from cache and a Sonner toast offers **Undo** for 5s; the DB delete only commits when the toast closes un-undone (`useUndoableDeleteExpense`, delayed-commit pattern). A red "Delete" hint reveals under the card during drag. Only fires for `canModify` rows.
- **Vertical drag > 12px**: cancels horizontal handling and lets the page scroll. `touchAction: pan-y` reinforces this on touch hardware.
- `setPointerCapture` keeps the gesture alive when the finger leaves the card during a swipe.

Inline ✎/🗑 buttons have been removed — all destructive actions are gesture-driven.

### Sort UI

`TrackerToolBar` exposes a popover containing **two stacked segmented controls**:
- **Sort by**: Date / Category / Amount
- **Order**: ↑ Asc / ↓ Desc

`SortOption` is a template literal type `${'date'|'category'|'amount'}-${'asc'|'desc'}`. `parseSort()` and `sortLabel()` helpers split/format the option. The popover footer shows a single human-readable caption ("Newest first", "Highest first", "A → Z", …).

Amount sort renders a **flat list** with a single synthetic header (`"N txns · Highest first"`) — no day grouping. Date and category sorts retain their day/category groups.

Sort preference persists in localStorage per tracker via `expensesync-sort-pref`. `VALID_SORTS` whitelist filters out stale or invalid values on read.

### Transfer review flow

Three pieces:
- A *suspected-transfer* count badge on the toolbar (Expenses + Dashboard), warn-colored. `useSuspectedTransfers(trackerId)` returns `{ all, pairedIds }` — the union of (a) rows with `suspected_transfer=true` (server-side keyword/AI flag), and (b) **pair-matched rows**: debit↔credit pairs across the tracker where dates are within ±1 day and amounts match within 1%. Pairs match cross-user so a transfer initiated by one member and received by another still surfaces. `is_transfer=true` rows are excluded.
- `TransferReviewModal` — ember-styled popup that auto-opens once per session per tracker when suspected transfers exist (dismissible).
- `TransferReviewSheet` — bottom sheet for the actual review. Letter-receipt rows with tri-state segmented control per row (Transfer / Not Transfer / Skip). Rows surfaced via the pair heuristic get a small warn-coloured "Pair" chip next to the merchant name. Bulk-action chips, ember save button. Discard-changes confirmation dialog when the user closes mid-review.

### Category Learning
- `category_learning` table maps `normalized_description → category_id`.
- Learning sources: manual entry, category edits, upload review corrections.
- Matching strategy: exact description → merchant keyword → word overlap.
- Applied during upload to pre-assign categories before the AI call.

### Multi-Currency Support
- 10 currencies: INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, SAR.
- Currency set per tracker.
- `convert-currency` edge function for bulk conversion.
- Per-expense `original_amount`, `original_currency`, `conversion_rate`, `conversion_note`.

### Transfer Detection
- Three booleans on expenses: `is_transfer` (user confirmed YES), `rejected_as_transfer` (user confirmed NO via the Review sheet), `suspected_transfer` (keyword/AI heuristic flagged at insert time).
- Two detection sources: (a) `transferDetector.ts` keyword patterns on entry/upload + AI flagging during parsing, persisted in `suspected_transfer`; (b) client-side **pair matching** in `useSuspectedTransfers` — pairs debit and credit rows within ±1 day and 1% amount tolerance, cross-user, excluding both `is_transfer=true` AND `rejected_as_transfer=true`. The two are unioned in the Review sheet.
- The `rejected_as_transfer` flag is the mirror of `is_transfer`: any future detector that surfaces transfers must honour it, or rejected pairs will keep reappearing. `useBulkResolveTransfers` writes it on the "Not Transfer" path.

---

## HOOKS REFERENCE

### useExpenses.ts
- `useExpenseMonths(trackerId)` — distinct months with data
- `useExpenses(trackerId, month)` — fetch expenses (or all if month='all')
- `useCreateExpense()` / `useUpdateExpense()` / `useDeleteExpense()` — single CRUD
- `useBulkCreateExpenses()` / `useBulkDeleteExpenses()` / `useBulkUpdateCategory()` / `useBulkMoveExpenses()` — batch ops
- `useBulkResolveTransfers()` — confirm/reject suspected transfers in bulk
- `useExpenseRealtime(trackerId)` — realtime subscription
- `useDuplicateCheck(trackerId)` — Levenshtein-based duplicate detection
- `useSuspectedTransfers(trackerId)` — returns `{ all, pairedIds }`. `all` is the union of rows where `suspected_transfer=true` and rows that participate in a debit↔credit pair (±1 day, amounts within 1%, cross-user). Both pools exclude `is_transfer=true` AND `rejected_as_transfer=true`. Internally calls `findTransferPairs(rows)` — see Transfer Detection.

### useBanks.ts
- `useBanks()` — all registered banks, ordered by canonical name. Degrades to `[]` (rather than throwing) if the `banks` table isn't migrated yet (`42P01`/`PGRST205`).
- `useResolveBankName()` — returns a stable async `(raw: string) => { id, canonical_name } | null` that resolves free text against the registry (exact/alias/fuzzy match via `bankResolver.ts`), creating a new `banks` row only when nothing close enough exists. Used by both `UploadStatement.tsx` (save) and `AddExpenseSheet.tsx` (save) so manual entries and uploads canonicalise the same way.

### useTrackers.ts
- `useTrackers()` — all user trackers (via `get_tracker_stats` RPC)
- `useTracker(trackerId)` / `useCreateTracker()` / `useUpdateTracker()` / `useDeleteTracker()`
- `useTrackerMembers(trackerId)` / `useInviteMember()` / `useAddMember()` / `useRemoveMember()` / `useUpdateMemberRole()`
- `useCategories(trackerId?)` / `useCreateCategory()` / `useUpdateCategory()` / `useDeleteCategory()`
- `useConvertTrackerCurrency()`

### useTransactionTypeFilter.ts
- `useTransactionTypeFilter(trackerId)` → `[filter, setFilter]`
- Syncs to URL `?type=` param AND localStorage (per-tracker). Only used by Transactions tab — Dashboard has no Type filter.

### useNudge.ts
- `useNudge(key, delayMs)` → `{ show, dismiss }` — one-time localStorage-persisted nudge.

### useMonthSwipe.ts
- `useMonthSwipe(ref, months, currentMonth, onMonthChange)` — attaches horizontal-swipe handlers to a container ref; swipe-left → newer month, swipe-right → older. Filters out the `'all'` sentinel and bounds at the oldest/newest entries (no wrap). Wired into Expenses + Dashboard tab roots.
- `adjacentMonths(months, current)` → `{ prev, next }` — companion helper that returns the same prev/next pair the swipe gesture would step to. Used by `MonthNavChevrons` so the on-card chevrons disappear at boundaries.

### useOverlayBack.ts
- `useOverlayBack(open, setOpen)` — called transparently inside every Radix Root wrapper in `src/components/ui/` (Sheet, AlertDialog, Dialog, Popover). On open, pushes a sentinel history entry; on `popstate`, pops the topmost handler from a module-level stack and invokes it. Programmatic close (X, ESC, outside-click) is detected via effect cleanup and pops the sentinel from history with a `suppressPop` guard. `pushState` is called without a URL argument so React Router never sees a navigation.

---

## SYSTEM CATEGORIES

**Debit (19):** Food & Dining, Groceries, Transport, Fuel, Shopping, Entertainment, Travel, Healthcare, Utilities, Rent, Education, Personal Care, Subscriptions, EMI / Loan, Insurance, Investments, Gifts & Donations, Office & Business, Miscellaneous

**Credit (6):** Salary / Income, Refund, Reimbursement, Cashback / Reward, Interest Earned, Other Income

---

## DESIGN SYSTEM — Sand & Ember

### CSS Variables (`src/index.css`)

Warm palette in HSL:

| Token | Light | Purpose |
|---|---|---|
| `--background` | `#F6F1E7` (sand) | Page background |
| `--foreground` / `--ink` | `#1F1B16` (deep ink) | Body text |
| `--ink-soft` | `#5C544A` | Muted body |
| `--ink-faint` | `#9B948A` | Captions |
| `--card` | `#FFFFFF` | Card surfaces |
| `--surface-alt` | `#FBF7EE` | Layered surface |
| `--line` / `--line-soft` | `#E7DFD0` / `#EFE9DC` | Hairlines |
| `--ember` / `--primary` | `#E66B47` | Accent (single ember coral) |
| `--spend` / `--spend-bg` | `#C24A37` / `#FBE7E0` | Debits / warm clay |
| `--earn` / `--earn-bg` | `#2F7D5F` / `#E0EFE5` | Credits / forest |
| `--warn` / `--warn-bg` | `#D89A2C` / `#FBEFD0` | Warnings / amber |
| `--chip-bg` | `#F1EADB` | Neutral chip bg |

The shadcn `primary` token is aliased to `ember`, so all `bg-primary` / `text-primary` consumers automatically pick up the new accent.

Dark mode is defined symmetrically (ink as background, cream as foreground) but unused in practice — the app is currently light-only.

### Typography

Loaded from Google Fonts in `index.css`:
- **Bricolage Grotesque** — `font-display`. Display, section titles, card titles (merchant names). Variable optical-size + weights 400-700.
- **Manrope** — `font-sans` (default body). All UI text.
- **JetBrains Mono** — `font-mono`. Amounts (with `font-variant-numeric: tabular-nums` set in the `.font-mono` utility).

### Tailwind tokens (`tailwind.config.ts`)

Tailwind exposes the CSS vars as utilities:
- `bg-ember` / `text-ember`
- `bg-ink` / `text-ink` / `text-ink-soft` / `text-ink-faint`
- `bg-spend` / `bg-spend-bg` / `text-spend`
- `bg-earn` / `bg-earn-bg` / `text-earn`
- `bg-warn` / `bg-warn-bg` / `text-warn`
- `bg-line` / `bg-line-soft`
- `bg-surface` / `bg-surface-alt`
- `bg-chip`

### Iconography
- Single curated family in app code: `@phosphor-icons/react`, `weight="regular"` (monoline). `CategoryIcon` always renders regular weight; `CategoryDot` is the colored-disc wrapper that pairs an icon with a soft-tinted background.
- `lucide-react` is retained only inside the vendored shadcn `ui/*` primitives (dialog/X, command/Search, etc.) — never import it from outside `src/components/ui/`. Bank logos use real favicons via `BankBadge` (Google's `s2/favicons`, domain/color resolved from the `banks` DB registry first, then the hardcoded `bankBrand.ts` map), with a curated brand-color monogram disc as the offline fallback. Payment methods use `PaymentBadge` (per-method Phosphor icon + tinted disc).
- Emoji is no longer used anywhere as an icon. Custom category creation uses the icon-picker UI (3-column AI suggestion + 6-column "Browse all" grid).

### Color conventions
- Debit amounts: `text-ink` (default), no prefix
- Credit amounts: `text-earn` with `+` prefix and `ArrowDownLeft` icon
- Spend/up arrows: `text-spend` or `text-spend-bg`-backed pills
- Earn/down arrows: `text-earn` or `text-earn-bg`-backed pills
- Transfer chips: `bg-warn/15 text-warn`
- Selected card: `bg-ember/10` + `border-ember/55`

---

## TOAST EVENTS

All toasts use `sonner` positioned `bottom-center`:

| Event | Message |
|---|---|
| Transaction saved | `toast.success('Transaction saved')` |
| Transaction updated | `toast.success('Transaction updated')` |
| Transaction deleted | `toast.success('Transaction deleted')` |
| Transactions imported | `toast.success('[N] transactions imported! ...')` |
| Partial-parse warning | `toast.warning("Some sections couldn't be parsed (N). Review carefully — a few transactions may be missing.")` |
| Tracker created | `toast.success('Tracker created! ...')` |
| Tracker deleted | `toast.success('Tracker deleted')` |
| Member added | `toast.success('[Name] added to tracker')` |
| Member removed | `toast.success('Member removed')` |
| Category learned | `toast.success('Category preference saved ...')` |
| Auth error | `toast.error(error.message)` |
| Upload parse error | `toast.error('Failed to parse statement...')` |

---

## BUSINESS RULES

- Only tracker admin can delete the tracker — hide control for members.
- Only expense creator OR tracker admin can edit/delete an expense (swipe + tap gestures gated on `canModify`).
- Custom categories are tracker-scoped — only show current tracker's categories in picker.
- Uploaded files are NEVER stored — raw bytes stay in browser; only extracted text goes to edge function.
- Duplicate check runs on every manual save (Levenshtein similarity ≥ 0.8).
- Category corrections always write to `category_learning`.
- HeroSummary on Expenses tab is filter-aware (filter zeros the opposite direction).
- Excel export always exports ALL transactions for the month (never filtered by type).
- Transaction type filter is personal (localStorage per tracker) — doesn't affect other members.
- Realtime subscription active on Expenses and Dashboard tabs.
- `raw_description` is preserved on every uploaded expense; never overwritten by the client. Re-runs of the merchant pipeline are safe because they only touch `description` and `merchant_name`.

---

## COMMANDS

```bash
# Bun is the package manager: bun.lock is the only lockfile (package-lock.json and bun.lockb were removed Oct 2026)
bun run dev            # Start dev server (port 8080)
bun run build          # Production build
bun run preview        # Preview production build
bun run lint           # ESLint
bun run test           # Vitest (run once)
bun run test:watch     # Vitest (watch mode)
bun run build:android  # Native bundle + cap sync android (see ANDROID APP)

# Supabase
supabase db push                                                       # Apply migrations
supabase gen types typescript --linked > src/integrations/supabase/types.ts  # Regen types
supabase functions deploy <name>                                       # Deploy edge function
supabase secrets set KEY=value                                         # Set edge function secret
supabase functions logs <name>                                         # View function logs
```

---

## MIGRATIONS

Listed chronologically (newest last). Always create a new migration file; never edit existing ones.

1. Core schema: profiles, trackers, tracker_members, categories, expenses + RLS + triggers
2. System categories seed (25 categories)
3. Category learning table + realtime setup
4. `get_tracker_stats` RPC function
5–10. Incremental additions (bank_name, is_transfer, payment_method updates, raw_description on category_learning, etc.)
11. Email column on profiles
12. Field migration to notes
13–14. created_by_name removal and restoration (with nullable FK)
15. Bank name + payment method enum update
16. `is_transfer` column addition
17. `suspected_transfer` column addition
18. System category icons migrated from emoji to Phosphor icon names (`20260410_update_system_category_icons.sql`)
19. **`raw_description` column added to `expenses`** (`20260522_add_raw_description.sql`)
20. **`rejected_as_transfer` column added to `expenses`** + partial index (`20260523_add_rejected_as_transfer.sql`) — fixes the "Not Transfer" bug where pair-matched rows re-surfaced on every refetch.
21. **Security hardening** (`20260526085546_...sql`) — `profiles` SELECT narrowed to self + shared-tracker members; `tracker_members` self-insert removed in favour of an `add_tracker_admin_member` `SECURITY DEFINER` trigger; EXECUTE revoked from `anon`/`public` on the internal helpers (only `authenticated` keeps `is_tracker_member`, `is_tracker_admin`, `get_tracker_stats`).
22. **Hardened tracker UPDATE policies** (`20260603092233_...sql`, by Lovable) — recreated the `expenses` "Creator or admin can update" and `categories` "Members can update custom categories" UPDATE policies with explicit `WITH CHECK` clauses that re-verify tracker membership on the **new** row. Closes a cross-tracker move: previously the absent `WITH CHECK` defaulted to the `USING` clause, so a creator (whose `created_by_id = uid` survives a `tracker_id` change) could move a row into a tracker they aren't a member of. See the RLS Policies note above.

23. **`get_tracker_home_stats` RPC** (`20260611100000_add_get_tracker_home_stats.sql`) — server-side Home page aggregation; see RPC Functions. ⚠️ Not yet applied to the linked project (MCP is read-only, CLI not logged in) — apply with `supabase db push` or paste into the dashboard SQL editor; the client falls back gracefully until then.
24. **`pinned_tracker_ids` on profiles** (`20260611130000_add_pinned_tracker_ids.sql`) — uuid[] for the Home bento pins, covered by the existing self-update policy. ⚠️ Also pending application; `usePinnedTrackers` keeps pins in localStorage until the column exists.
25. **`banks` registry + `expenses.bank_id`** (`20260721120000_add_banks_registry.sql`) — canonical bank table (`canonical_name`, `aliases[]`, `domain`, `brand_color`), seeded from the banks previously hardcoded in `bankBrand.ts`. Adds `expenses.bank_id` FK and backfills it from existing `bank_name` text via `normalize_bank_name()` (alias/suffix-insensitive match), registering any unrecognised existing spelling as its own new bank so no data is lost. See the `banks` table entry above and `useBanks.ts`.

After applying migrations, run `supabase gen types` to refresh `src/integrations/supabase/types.ts`. The current types.ts is hand-edited for `raw_description` — re-running gen will produce equivalent output.

---

## ANDROID APP (in progress)

Plan: `docs/android-app-plan.md`. A **Capacitor 8** shell around this same Vite build, made offline-first: a local SQLite store, an outbox for offline writes, and a pull/push sync engine against Supabase. **Phase 0 (spike)** is complete; it lives on branch **`spike/android-offline`**, which is throwaway and **not for merging**. Results: `docs/android-spike-runbook.md` §8 on that branch. **Phase 1 (online-only wrapper)** is merged to `main`. **Phase 2 (local reads)** is on branch **`android/phase-2`** (pushed, not merged). **Phase 3 (offline writes)** is on branch **`android/phase-3`**, cut from it: transactions can be added, edited and deleted offline and sync when the network returns.

What anyone touching the Android work needs to know:
- **Layout:** `capacitor.config.ts` (appId **`com.expensesync.app`**, final) and the committed native project in `android/`. Native-only JS sits behind `isNativeApp` (`src/lib/platform.ts`) and is dynamically imported, so the web bundle carries only `@capacitor/core` and the small `src/lib/local/state.ts`:
  - `src/lib/nativeShell.ts`: back button, plus re-reads on app resume.
  - `src/lib/nativeGoogleAuth.ts`: native Google sign-in.
  - `src/lib/local/`: the local store.
- **Build:** `bun run build:android` runs `vite build --mode capacitor` then `cap sync android`; then `cd android && ./gradlew assembleDebug`. The `capacitor` mode disables the PWA service worker, drops `viewport-fit=cover` from `index.html` (see Safe areas), and loads `.env.capacitor`, which holds the Google **Web** OAuth client ID. That ID is public and committed.
- **Toolchain:** Gradle needs **JDK 21**; Android Studio's bundled JDK 25 fails with `Unsupported class file major version 69`. `android/gradle/gradle-daemon-jvm.properties` (`toolchainVersion=21`) makes the Gradle daemon pick an installed JDK 21 (it finds `~/.jdks`) whatever `JAVA_HOME` says. The `gradlew` launcher itself still needs *some* `java` on `JAVA_HOME`/`PATH`. Keep **AGP 8.13 / Gradle 8.14.3** from Capacitor's template and **decline Android Studio's AGP 9 upgrade**, which rejects the template's `proguard-android.txt`.
- **Permissions:** `INTERNET` and `ACCESS_NETWORK_STATE`. Without the second, the WebView can't see connectivity: `navigator.onLine` stays `true` and `online`/`offline` events never fire.
- **Safe areas:** Capacitor 8's built-in SystemBars plugin goes edge-to-edge only when the page declares `viewport-fit=cover`. The native build drops that, so SystemBars pads the WebView between the status bar and the gesture bar, and the cream `windowBackground` (`android/app/src/main/res/values/styles.xml`) shows behind them. The `env(safe-area-inset-*)` uses in web code resolve to 0 there. `SystemBars.style: 'LIGHT'` keeps the bar icons dark. Capacitor logs `Error injecting safe area CSS` at startup: a harmless race in its `--safe-area-inset-*` injection, which we don't use.
- **Back button:** `nativeShell.ts` maps `@capacitor/app`'s `backButton` to `history.back()` so `useOverlayBack` closes the top overlay. On `/`, or with no history, it minimises the app instead.
- **Icon/splash:** an adaptive icon split from `public/logo-512.png` into a gradient background layer and a glyph foreground layer (`mipmap-*/ic_launcher_{background,foreground}.png`), plus legacy PNGs. The splash is a cream `windowSplashScreenBackground` with the launcher icon; before Android 12 it's `drawable/splash.xml`.
- **Native Google sign-in** needs the installing key's SHA-1 on the Android OAuth client (each dev's debug key, the release key, and Play App Signing). See `docs/android-google-signin.md`.

**Local store (Phase 2), `src/lib/local/`:**
- **Files:**
  - `db.ts`: the `@capacitor-community/sqlite` connection.
  - `sync.ts`: the pull engine.
  - `reads.ts`: the local versions of the hook reads.
  - `state.ts`: SQLite-free shared state (`markStale`, the query-client binding, `LocalNotSyncedError`, the profile cache).
  - `outbox.ts`: offline writes (local row + outbox entry in one transaction) and the push engine (Phase 3).
- **Hooks:** each read hook (`useTrackers`, `useTrackerHomeStats`, `useTracker`, `useTrackerMembers`, `useCategories`, `useBanks`, `useExpenses`, `useExpenseMonths`, `useSuspectedTransfers`) starts its `queryFn` with `if (isNativeApp) return (await import('@/lib/local/reads')).readX(...)`. The web path below it is unchanged. A new read hook needs the same branch, or it won't work offline.
- **Tables:**
  - Each table stores the server row as `row_json`, plus explicit columns for whatever SQL filters, sorts or sums on.
  - Server columns added later flow through without a local schema change.
  - Store layout changes are **migrations that keep data**: add a step to `MIGRATIONS` in `db.ts` and bump `SCHEMA_VERSION`. Never drop tables, since the outbox may hold unpushed changes. v1→v2 added `expenses.sync_state` / `local_deleted` and the `outbox` table.
- **Pulls:**
  - **Meta** (profiles, trackers, members, categories, banks): replaced wholesale. A fingerprint skips the write and the re-render when nothing changed.
  - **Expenses:** incremental by the server's `updated_at`, with one cursor across all trackers, a 5-minute overlap, and keyset pagination on `(updated_at, id)`. The next page downloads while the current one is written.
  - **Deletes:** a pull by `updated_at` can't see hard deletes. Each refresh compares every relevant tracker's server row count (a HEAD request) with the local count, and on a mismatch fetches the ids and drops local extras. So **Phase 2 needs no soft-delete migration**.
- **Reads are stale-while-revalidate:**
  - A read returns local data at once and starts a pull. If the pull changed anything, every active query re-reads.
  - A read waits for its pull only when the device has never synced (up to 60 s; offline it throws `LocalNotSyncedError`, so screens show `LoadError`), or after a known change: `markStale()` from the `MutationCache` `onSuccess` hook (server writes only), the realtime handler, Home's invite loop, and after the outbox pushes (up to 4 s).
  - Any *server* write that bypasses `useMutation` must call `markStale()`, or a just-deleted row can flash back. Local writes (outbox) don't need it.
- **Triggers:**
  - Reads.
  - Reconnect: `onlineManager.subscribe` (transition-only), seeded from `navigator.onLine` at startup.
  - App resume: `@capacitor/app` `resume`.
  - Failed pulls retry with backoff (3 s → 60 s) while online.
  - The native `QueryClient` uses `networkMode: 'always'` so queries run offline, and it doesn't retry `LocalNotSyncedError`.
- **Auth offline (spike Q3, fixed):** `AuthContext` starts from the session persisted in localStorage (`src/lib/storedSession.ts`) instead of waiting for supabase-js.
  - A null-session event while the stored session still exists means "refresh couldn't reach the server", so the user stays signed in. supabase-js deletes the stored session on a real sign-out or a rejected refresh token.
  - The profile is cached in localStorage (`expensesync-profile-cache`).
  - **Sign-out** on native first tries to push the outbox (up to 10 s). If changes are still unsynced, it asks before discarding them (`window.confirm`). `signOut()` resolves `false` if the user cancels. It then wipes SQLite and the query cache. Offline, supabase-js keeps the session when its sign-out call fails, so the app removes the stored session itself and reloads. The server-side refresh token is then not revoked.

**Offline writes (Phase 3), `src/lib/local/outbox.ts`:**
- **Which writes:** creating, editing and deleting transactions, including bulk category change, bulk delete, undoable swipe-delete and transfer review. In the app their hooks call `createExpenses` / `updateExpenses` / `deleteExpenses` instead of Supabase. Each writes the local row and an `outbox` entry in one SQLite transaction, then pushes right away if online.
- **Ids:** new rows get `crypto.randomUUID()` on the device.
- **Row states:** `expenses.sync_state` is `synced`, `pending_insert`, `pending_update`, `pending_delete` or `failed`.
  - A pending delete keeps the row as a hidden tombstone (`local_deleted = 1`) until the delete reaches the server.
  - Reads filter out `local_deleted` and expose `Expense.sync_status` (`'pending' | 'failed'`). `TxnRow` shows a cloud icon (pending) or a warning icon (failed).
- **Push engine:**
  - It replays the outbox in `seq` order.
  - An insert that hits `23505` counts as done (an earlier attempt landed).
  - Pushes never send `created_at` / `updated_at`.
  - An update that matches no row (deleted elsewhere, or RLS now hides it) drops the local row and its entries.
  - A network error stops the drain and keeps the order.
  - **Permanent errors** (SQLSTATE 22/23/42, PostgREST 1xx/2xx) mark the entry, every later entry for that row, and the row as `failed`, then move on. Nothing blocks the queue.
- **Triggers:** each `ensureExpenses` pull pushes first. The pull still runs if the push fails, and the push error then schedules the retry. Local writes push immediately, and the reconnect and resume triggers re-run reads, which pull.
- **Pulls (rule 4):** a pulled row never overwrites a row that isn't `synced` (`ON CONFLICT … WHERE sync_state = 'synced'`). Reconcile ignores `pending_insert` rows and only drops `synced` ones.
- **Mutation meta:** `meta: { localWrite: true }` on these mutations tells the `MutationCache` not to `markStale()`. The local store already has the change.
- **Banks offline:** a name that matches the cached registry gets its id. Otherwise the row keeps the typed `bank_name`, and the push resolves or registers `bank_id` (`withBankId`).
- **Online-only in the app:**
  - Statement upload: gated at both entry points.
  - Trackers, members, categories, moving transactions between trackers: `assertOnline()` throws a friendly `OFFLINE_MESSAGE`. Native mutations use `networkMode: 'always'`, so they'd otherwise fail with "Failed to fetch".
  - **Foreign-currency entries** are blocked offline with a toast, because conversion needs the `convert-currency` edge function. That's the plan §8 decision for v1.
  - Category learning is skipped offline.
- **`SyncStatusPill`** (native only, above the bottom nav) shows "Offline · N waiting to sync", "Syncing N changes…" or "N changes couldn't sync". Tapping the failed state shows the server's error.
- **Phase 4 still to do:**
  - A way to retry or discard failed entries; today they stay marked.
  - Delete-vs-edit conflict handling, plus soft delete if needed.
  - Duplicate checks against offline rows: `useDuplicateCheck` already reads local data.
- **Wipe safety:** `wipe()` bumps an epoch, and pulls pass the epoch they started under to `runInTransaction`, which refuses stale writes. That stops a pull still in flight at sign-out from refilling the store.
- **Debugging:** the debug build's WebView is inspectable. `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then use Chrome DevTools or CDP, e.g. `Capacitor.Plugins.CapacitorSQLite.query({database:'expensesync', statement:'…', values:[], readonly:false})`. In SQL, string literals need **single** quotes: double quotes mean identifiers.
- **Spike findings still open:** watch lazy localStorage writes (a refresh-token rotation followed by an immediate kill).

## KNOWN QUIRKS & FUTURE WORK

- **Never let a failed or paused query render an empty state.** With nothing cached, a failed query must show `LoadError` ("Couldn't load … / Try again"), not "No trackers yet" or "No transactions in {month}". Home, Profile, TrackerDetail and the Transactions/Dashboard tabs do this. React Query (default `networkMode: 'online'`) assumes online at startup, so a cold start offline **errors**. Once it has seen an offline event, new queries instead **pause** (`isPaused`), and `isLoading` (`isPending && isFetching`) is `false` while paused. So check `isError || isPaused` with no data, and use `LoadError`'s `offline` mode for the paused case (no retry button; queries resume on reconnect). TrackerDetail redirects with "Tracker not found" only for a genuinely missing tracker (`PGRST116` / `22P02`), not on network failures. In the Android app, queries run with `networkMode: 'always'` against the local store and never pause; the only offline failure is `LocalNotSyncedError` (never synced), which surfaces through the same `isError` path. The local `readTracker` throws `PGRST116` for a tracker that isn't in the synced store.

- **Edge function token cost / free-tier rate limits.** Each chunk re-sends the full ~4 KB system prompt. Chunking is now intentionally tuned for the **Gemini free tier**: large 25k-char chunks + `CONCURRENCY = 1` keep a normal statement to one Gemini call so requests-per-minute stays low. Raising concurrency would improve wall-clock on very long statements but reintroduces the burst that trips the free-tier RPM cap (the original 502/504 symptom). If the project moves to a billed Gemini key, concurrency can be raised again. The binding free-tier limit is **requests-per-minute**, not volume — a single click previously fanned out into ~5–16 Gemini calls (metadata + chunked parse × server-retry × client-retry), which is what caused 100%-error 429s at low daily request counts.
- **Notifications row** in Settings → Preferences is a placeholder; tapping toasts "Notifications are not yet wired up".
- **3-tab BottomNav** uses `activeTrackerId` from `AppContext` to deep-link the Trackers tab. If a user has zero trackers, the tab falls back to `/`.
- **lucide-react remains as a transitive icon dep** for the vendored shadcn `ui/*` primitives (dialog/X, command/Search, etc.). All non-primitive code uses Phosphor. Don't import lucide from anywhere outside `src/components/ui/`.
