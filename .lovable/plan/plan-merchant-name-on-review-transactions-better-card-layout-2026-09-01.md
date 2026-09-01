# Plan: Merchant Name on Review Transactions + Better Card Layout

## Current state
In `src/pages/UploadStatement.tsx` (review step), each draft card shows: checkbox, category dropdown, amount (tap to toggle debit/credit), date, description, notes. The parsed `merchant_name` exists on every draft but is never displayed — the user reviews transactions without seeing who the money went to.

## What changes

### 1. Restructure the draft card to mirror the TxnRow visual language
Each review card becomes:

```text
[✓] [CategoryDot]  Swiggy                    ↑ ₹420
                    Food & Dining ▾    12-Mar
    Order #48291 · dinner                  [↔ Possible transfer]
    ▸ Original narration (tap to expand)
```

- **Row 1 (primary):** category dot + **merchant name** in `font-display` semibold (falls back to description when no merchant), amount toggle + date on the right. Merchant is what users scan for — it becomes the title.
- **Row 2:** the existing category `Select` (now on its own row, with the category icon) so the merchant title doesn't compete with the dropdown.
- **Row 3 (secondary):** description (when it differs from merchant) + suspected-transfer chip + low-confidence warning, as today.
- **Expandable raw narration:** a subtle "View original" chevron row reveals `raw_description` verbatim (mono, muted) — useful to verify the merchant without cluttering the list. Per-card collapsed state, default collapsed.

### 2. Editable merchant name
Tap the merchant name → it becomes an inline text input (auto-focused, save on blur/Enter). Edits update the draft only; `raw_description` is never touched. This lets users fix merchant extraction mistakes before saving, since `merchant_name` drives filters, dedupe, and category learning.

### 3. Keep everything else identical
Checkbox toggle, debit/credit amount toggle, notes, warnings, sticky Save button, and `handleSaveAll` are unchanged.

## Technical details
- **File:** `src/pages/UploadStatement.tsx` only.
- New local state: `expandedRawIds: Set<string>` and `editingMerchantId: string | null` (plus a small inline-input component or controlled draft field update via an existing `updateDraft`-style setter; add `handleMerchantChange(temp_id, value)`).
- Merchant editing disabled for discarded drafts.
- Reuses `CategoryDot`/`CategoryIcon`, existing Tailwind tokens (no new colors), Phosphor `CaretDown`/`CaretUp` for the expand toggle.
