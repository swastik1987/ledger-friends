# ExpenseSync — Engineering Reference

## PROJECT OVERVIEW

**ExpenseSync** is a production-grade, mobile-first collaborative expense tracking Progressive Web App. It features AI-powered bank statement parsing (Gemini 2.5 Flash), real-time multi-user collaboration, category learning, multi-currency support, and Excel export. The app is fully functional and deployed.

The tracker page received a full visual + interaction revamp in May 2026 — "Sand & Ember" — moving from an indigo/violet palette + emoji icons to a warm cream/ink design with monoline Phosphor icons, gesture-driven cards, and an iOS-style grouped settings layout. The statement-upload pipeline was hardened with server-side chunking and a dedicated client-side merchant-extraction library.

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
│   │   ├── useExpenses.ts                    # CRUD + bulk + realtime + duplicate + suspected-transfers
│   │   ├── useTrackers.ts
│   │   ├── useTransactionTypeFilter.ts       # URL + localStorage synced
│   │   ├── useNudge.ts
│   │   └── use-mobile.tsx
│   │
│   ├── components/
│   │   ├── BottomNav.tsx                     # 3-tab: Home / Trackers / You
│   │   ├── FloatingAdd.tsx                   # Ember ember FAB (on Home + Expenses)
│   │   ├── CategoryDot.tsx                   # Colored disc + Phosphor line icon
│   │   ├── CategoryIcon.tsx                  # Phosphor regular weight render
│   │   ├── Nudge.tsx
│   │   ├── NavLink.tsx
│   │   ├── tracker/
│   │   │   ├── TrackerTopBar.tsx             # Sticky top: back · name · upload
│   │   │   ├── TrackerTabBar.tsx             # Sticky at top:57px, dark-pill active
│   │   │   ├── HeroSummary.tsx               # Dark ink card: Net Outgo + In + Net Savings
│   │   │   ├── TrackerToolBar.tsx            # Month dropdown + sort + filter + transfer
│   │   │   ├── TypeSegment.tsx               # All / Out / In segmented control
│   │   │   ├── DayHeader.tsx                 # Day/category/amount-sort group header
│   │   │   ├── TxnRow.tsx                    # Letter-receipt card with gestures
│   │   │   ├── FilterSheet.tsx               # Bottom sheet: people + categories
│   │   │   ├── ExpensesTab.tsx               # Owns the list, gestures, multi-select
│   │   │   ├── DashboardTab.tsx              # Hero spend + sparkline + share bar + biggest
│   │   │   ├── SettingsTab.tsx               # iOS-style grouped lists + danger zone
│   │   │   ├── AddExpenseSheet.tsx           # Manual create/edit with optional Merchant field
│   │   │   ├── TransferReviewModal.tsx       # Ember-styled popup
│   │   │   └── TransferReviewSheet.tsx       # Bottom-sheet review with tri-state controls
│   │   └── ui/                               # shadcn/ui primitives
│   │
│   ├── lib/
│   │   ├── categoryLearning.ts               # AI category memory
│   │   ├── currencies.ts                     # 10-currency + formatAmount + formatAmountShort
│   │   ├── transferDetector.ts               # Internal-transfer keyword detection
│   │   ├── merchantDictionary.ts             # Curated merchant→category rules
│   │   ├── merchantExtraction.ts             # NEW: merchant/description normalisation pipeline
│   │   ├── phosphorIcons.ts                  # Icon name → Phosphor component map + heuristic picker
│   │   └── utils.ts
│   │
│   ├── types/
│   │   └── index.ts                          # Expense, DraftExpense, Tracker, …
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts
│   │   └── types.ts                          # Generated DB types (hand-edited for raw_description)
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                             # Sand & Ember CSS vars + utilities
│
├── supabase/
│   ├── migrations/                           # 19 migration files
│   └── functions/
│       ├── parse-statement/                  # Statement → transactions (chunked)
│       ├── convert-currency/
│       ├── delete-account/
│       └── suggest-emojis/
│
├── public/                                   # Static assets
├── vite.config.ts                            # SWC + lovable-tagger, port 8080
├── tailwind.config.ts                        # Sand & Ember tokens + display/sans/mono fonts
├── tsconfig.json / tsconfig.app.json         # strict: false
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
- `is_debit`, `source` ('manual' | 'statement_upload'), `is_transfer`, `suspected_transfer`
- `original_amount`, `original_currency`, `conversion_rate`, `conversion_note`
- `created_at`, `updated_at` (auto-updated via trigger)

**category_learning**
- `id`, `normalized_description` (unique), `merchant_name`, `category_id`, `applied_count`, `updated_at`

### RLS Policies
- Tracker-scoped data is restricted by tracker membership
- System categories readable by all authenticated users
- Only admins update/delete trackers and manage members
- Expense edit/delete: creator OR tracker admin
- Category learning is globally shared

### Realtime
- `expenses` table is published to `supabase_realtime`
- Client subscribes per tracker: `postgres_changes` on `expenses` filtered by `tracker_id`

### RPC Functions
- `get_tracker_stats` — Returns trackers with member_count, monthly_total, date_range

---

## EDGE FUNCTIONS (4)

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
  raw_description?: string;     // NEW: original statement narration
  merchant_name?: string;
  // …
}

interface DraftExpense {
  // …
  description: string;
  raw_description?: string;     // NEW: preserved through review
  merchant_name?: string;
  // …
}
```

**Casting tip:** with `strict: false` you can technically assign any string to a literal union type, but a runtime mismatch will still crash. Cast explicitly (`value as PaymentMethod`) for clarity.

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
- `HeroSummary` dark ink card: big label "Net outgo this month", big number = total month debits, sub-chips "Total In" (credits) and "Net Savings" (In − Out, signed and color-tinted green/coral). All three values are filter-aware: the `Out` filter zeros earn; the `In` filter zeros spend.
- `TrackerToolBar`: month dropdown · transfer-review button (warn-coloured with count badge, both Expenses + Dashboard tabs) · sort button · filter button (with badge).
- `TypeSegment`: All / Out / In segmented control — replaces the old `TransactionTypeFilter`.
- Day group headers show net delta `+₹X` / `−₹X` color-coded.
- `TxnRow` letter-receipt cards (see gesture model below).
- `FilterSheet` bottom sheet: people multi-select + category multi-select + ember "Show N matching" CTA. Filter applied client-side.
- Multi-select: dark header at top + floating action bar bottom-anchored with Category / Move / Delete.
- Sort UI: see "Sort UI" section below.
- `FloatingAdd` opens `AddExpenseSheet`.
- Realtime subscription invalidates the query on changes.

**Dashboard Tab:**
- Hero spend card: total month spend (or income, filter-aware) + percentage change vs previous month + average per day + transaction count + hand-rolled SVG sparkline.
- "Where it went" combined block: stacked-share bar across the top, then a category list per row with `CategoryDot`, name, count, percentage, mono amount, and MoM change (color-coded for direction). Tap a row to jump to that category in Expenses.
- "Biggest this month" list (top 5 by amount).
- Compare button opens `CompareSheet` — month-A vs month-B comparison with delta strip and per-category dual progress bars sharing one scale. Hidden when month is "All".
- Drops the prior dual-pie + summary-card + breakdown trio entirely (Recharts is no longer imported here).

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
4. **Review:** three accordion sections — Potential Duplicates / Needs Review / Ready to Save. Bulk insert on save. Category corrections write to `category_learning`.

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
- A *suspected-transfer* count badge on the toolbar (Expenses + Dashboard), warn-colored, count from `useSuspectedTransfers(trackerId)`.
- `TransferReviewModal` — ember-styled popup that auto-opens once per session per tracker when suspected transfers exist (dismissible).
- `TransferReviewSheet` — bottom sheet for the actual review. Letter-receipt rows with tri-state segmented control per row (Transfer / Not Transfer / Skip), bulk-action chips, ember save button. Discard-changes confirmation dialog when the user closes mid-review.

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
- `is_transfer` (user-confirmed) and `suspected_transfer` (heuristic) booleans on expenses.
- Detected via `transferDetector.ts` keyword patterns; AI also flags candidates during parsing.

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
- `useSuspectedTransfers(trackerId)` — pending suspected transfers

### useTrackers.ts
- `useTrackers()` — all user trackers (via `get_tracker_stats` RPC)
- `useTracker(trackerId)` / `useCreateTracker()` / `useUpdateTracker()` / `useDeleteTracker()`
- `useTrackerMembers(trackerId)` / `useInviteMember()` / `useAddMember()` / `useRemoveMember()` / `useUpdateMemberRole()`
- `useCategories(trackerId?)` / `useCreateCategory()` / `useUpdateCategory()` / `useDeleteCategory()`
- `useConvertTrackerCurrency()`

### useTransactionTypeFilter.ts
- `useTransactionTypeFilter(trackerId)` → `[filter, setFilter]`
- Syncs to URL `?type=` param AND localStorage (per-tracker).

### useNudge.ts
- `useNudge(key, delayMs)` → `{ show, dismiss }` — one-time localStorage-persisted nudge.

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
- Single curated family: `@phosphor-icons/react`, `weight="regular"` (monoline). `CategoryIcon` always renders regular weight; `CategoryDot` is the colored-disc wrapper that pairs an icon with a soft-tinted background.
- A few utility chrome icons still come from `lucide-react` (the project hasn't fully removed the lucide dependency). Mixing is OK if their visual weight matches.
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

After applying migrations, run `supabase gen types` to refresh `src/integrations/supabase/types.ts`. The current types.ts is hand-edited for `raw_description` — re-running gen will produce equivalent output.

---

## KNOWN QUIRKS & FUTURE WORK

- **Edge function token cost.** Each chunk re-sends the full ~4 KB system prompt. For very long statements, parallelising further beyond `CONCURRENCY = 2` could help wall-clock but would amplify rate-limit risk.
- **Notifications row** in Settings → Preferences is a placeholder; tapping toasts "Notifications are not yet wired up".
- **3-tab BottomNav** uses `activeTrackerId` from `AppContext` to deep-link the Trackers tab. If a user has zero trackers, the tab falls back to `/`.
- **lucide-react remains as a transitive icon dep** for the vendored shadcn `ui/*` primitives (dialog/X, command/Search, etc.). All non-primitive code uses Phosphor. Don't import lucide from anywhere outside `src/components/ui/`.
