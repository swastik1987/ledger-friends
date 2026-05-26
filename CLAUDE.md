# ExpenseSync — Engineering Reference

## PROJECT OVERVIEW

**ExpenseSync** is a production-grade, mobile-first collaborative expense tracking Progressive Web App. It features AI-powered bank statement parsing (Gemini 2.5 Flash), real-time multi-user collaboration, category learning, multi-currency support, and Excel export. The app is fully functional and deployed.

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
| Auth | Supabase Auth (email/password) |
| File Parsing | pdfjs-dist 4.0.379, PapaParse 5.5.3, XLSX 0.18.5 |
| AI | Gemini 2.5 Flash (via Supabase Edge Function) |
| Charts | hand-rolled SVG sparkline (Recharts removed from Dashboard) |
| Toasts | Sonner 1.7.4 |
| Icons | `@phosphor-icons/react` (regular weight — monoline) everywhere in app code; `lucide-react` remains only inside vendored shadcn `ui/*` primitives |
| Dates | date-fns 3.6.0 |
| Fonts | **Bricolage Grotesque** (display/headers), **Manrope** (UI body), **JetBrains Mono** (amounts) |

Dev server runs on `localhost:8080` via `npm run dev`.

**TypeScript strictness:** `strict: true` + `noImplicitAny: true` in both `tsconfig.json` and `tsconfig.app.json` (flipped May 2026). `tsc --noEmit` is clean — undeclared identifiers no longer slip through silently. Keep new code strict.

---

## ENVIRONMENT VARIABLES

**`.env.local`** (never committed):
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Supabase secrets** (set via `supabase secrets set`):
- `GEMINI_API_KEY` — used by `parse-statement` and `suggest-emojis` edge functions

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
│   │   ├── bankBrand.ts                      # Bank name → domain (Google favicon URL) + curated brand color + hash fallback + monogram
│   │   ├── paymentMethodMeta.ts              # Payment method → Phosphor icon + tinted color
│   │   ├── phosphorIcons.ts                  # Icon name → Phosphor component map + heuristic picker
│   │   └── utils.ts
│   │
│   ├── types/
│   │   └── index.ts                          # Expense, DraftExpense, Tracker, …
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts
│   │   └── types.ts                          # Generated DB types (hand-edited for raw_description + rejected_as_transfer)
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
├── public/                                   # Static assets
├── vite.config.ts                            # SWC + lovable-tagger, port 8080
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
- `payment_method`, `bank_name`, `notes`, `tags` (text[]), `reference_number`
- `is_debit`, `source` ('manual' | 'statement_upload'), `is_transfer`, `suspected_transfer`, `rejected_as_transfer`
- `original_amount`, `original_currency`, `conversion_rate`, `conversion_note`
- `created_at`, `updated_at` (auto-updated via trigger)

**category_learning**
- `id`, `normalized_description` (unique), `merchant_name`, `category_id`, `applied_count`, `updated_at`

### RLS Policies
- Tracker-scoped data is restricted by tracker membership
- **`profiles` SELECT** is scoped to self + users who share a tracker with the caller (tightened May 26 2026 — was previously any authenticated user). Stops user enumeration.
- System categories readable by all authenticated users
- Only admins update/delete trackers and manage members
- **`tracker_members` INSERT** is admin-only. The creator's admin row is auto-added by the `add_tracker_admin_member` `SECURITY DEFINER` trigger on `trackers` INSERT — `useCreateTracker` no longer inserts a member row.
- EXECUTE on internal `SECURITY DEFINER` helpers (`is_tracker_member`, `is_tracker_admin`, `get_tracker_stats`, `handle_new_user`, `update_updated_at_column`, `add_tracker_admin_member`) is revoked from `anon`/`public`; only `authenticated` retains the three callable from app code.
- Expense edit/delete: creator OR tracker admin
- Category learning is globally shared

### Realtime
- `expenses` table is published to `supabase_realtime`
- Client subscribes per tracker: `postgres_changes` on `expenses` filtered by `tracker_id`

### RPC Functions
- `get_tracker_stats` — Returns trackers with member_count, monthly_total, date_range

---

## EDGE FUNCTIONS (4)

**All edge functions are JWT-gated** (as of May 26 2026). Each function calls `supa.auth.getUser()` on the bound `Authorization` header and returns 401 to unauthenticated callers. Anonymous invocation of `parse-statement` / `convert-currency` / `suggest-emojis` is no longer possible — protects Gemini token budget.

### parse-statement
- **Purpose:** Extract and categorize transactions from bank/credit-card statement text.
- **AI Model:** Gemini 2.5 Flash (structured output via `responseSchema`).
- **Modes (selected via `body.mode`):**
  - `'metadata'` — cheap first pass: returns `{ statement_type, bank_name, base_currency, debit_credit_rule, column_semantics }`. Called once per upload from the client to prime the parsing pass.
  - `'emojis'` — suggests Phosphor icon names for new category names.
  - Default — parses transactions.
- **Server-side chunking** (default mode): if `extractedText.length > 22_000` chars, the function splits on line boundaries into ~22k chunks with a 200-char overlap (snapped to line boundary). Chunks run with concurrency 2 via a bounded pool; per-call `AbortSignal.timeout(110_000)`.
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
Unchanged from baseline: two-tab UI, `supabase.auth.signInWithPassword()` / `supabase.auth.signUp()`, profile auto-created via trigger, state via `AuthContext`.

### Home Page
- Greeting based on time of day + first name
- Tracker cards (name, monthly spend, member count, date range)
- `FloatingAdd` ember FAB (bottom-right, above BottomNav) opens the Create Tracker sheet
- BottomNav (`Home / Trackers / You`) at bottom — Trackers deep-links to `activeTrackerId` when set

### Tracker Detail
A `/tracker/:id` page with **two sticky bars at the top**: `TrackerTopBar` (back · tracker name + member dot · upload) sticks at `top: 0`, and `TrackerTabBar` (Transactions / Dashboard / Settings, dark-pill active state) sticks at `top: var(--tracker-topbar-h)`. TrackerTopBar measures itself with a `ResizeObserver` and publishes its height to `--tracker-topbar-h` on `<html>`; the TabBar consumes that variable with a 57px fallback. Both have `bg-background/95 backdrop-blur-md` so content scrolls translucent underneath.

**Expenses Tab:**
- `HeroSummary` dark ink card: big label "Net outgo this month", big number = total month debits, sub-chips "Total In" (credits) and "Net Savings" (In − Out, signed and color-tinted green/coral). All three values are filter-aware: the `Out` filter zeros earn; the `In` filter zeros spend. `MonthNavChevrons` sit inside the card at the left/right edges (dark tone, low opacity) and disappear at boundaries.
- `TrackerToolBar` (Transactions tab only): ink-pill month dropdown (matches the active TabBar style so the current month reads as a primary selection) · transfer-review button (warn-coloured with count badge) · sort button · filter button (with badge). Horizontal swipe on the tab body also steps months via `useMonthSwipe`, bounded — no wrap.
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
   - Client-side text extraction (pdfjs / Papa / XLSX), chunked: 2 pages / 40 rows / chunk
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
- **Horizontal swipe** ≥ 40% of card width: card slides with the finger up to ±140px, snaps back, and opens the in-card delete confirm dialog. A red "Delete" hint reveals under the card during drag. Only fires for `canModify` rows.
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
- `lucide-react` is retained only inside the vendored shadcn `ui/*` primitives (dialog/X, command/Search, etc.) — never import it from outside `src/components/ui/`. Bank logos use real favicons via `BankBadge` (Google's `s2/favicons`), with a curated brand-color monogram disc as the offline fallback. Payment methods use `PaymentBadge` (per-method Phosphor icon + tinted disc).
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
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)

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

After applying migrations, run `supabase gen types` to refresh `src/integrations/supabase/types.ts`. The current types.ts is hand-edited for `raw_description` — re-running gen will produce equivalent output.

---

## KNOWN QUIRKS & FUTURE WORK

- **Edge function token cost.** Each chunk re-sends the full ~4 KB system prompt. For very long statements, parallelising further beyond `CONCURRENCY = 2` could help wall-clock but would amplify rate-limit risk.
- **Notifications row** in Settings → Preferences is a placeholder; tapping toasts "Notifications are not yet wired up".
- **3-tab BottomNav** uses `activeTrackerId` from `AppContext` to deep-link the Trackers tab. If a user has zero trackers, the tab falls back to `/`.
- **lucide-react remains as a transitive icon dep** for the vendored shadcn `ui/*` primitives (dialog/X, command/Search, etc.). All non-primitive code uses Phosphor. Don't import lucide from anywhere outside `src/components/ui/`.
