

## Plan: Editable Categories on Draft Transactions + Category Learning

### What changes

**1. Update `UploadStatement.tsx` — Add category picker to each draft transaction (Step 4)**

In the review step, each transaction card gets a tappable category badge that opens a `Select` dropdown populated from the tracker's categories. When the user changes a category, the draft updates its `suggested_category_id` and `suggested_category_name`, and a flag `category_changed` is set on that draft.

**2. Extend `DraftExpense` type — Add `category_changed` flag**

Add `category_changed?: boolean` to the `DraftExpense` interface in `src/types/index.ts`. This tracks which drafts had their category manually corrected by the user.

**3. Update `handleSaveAll` — Record category corrections to `category_learning` table**

After saving expenses, for each draft where `category_changed === true`, upsert into the `category_learning` table with the normalized description, merchant name, and selected category ID. This uses the existing table structure (columns: `normalized_description`, `merchant_name`, `category_id`, `applied_count`). On conflict, increment `applied_count`.

No database migration needed — the `category_learning` table already exists with the right schema and RLS policies.

### Files to modify

- **`src/types/index.ts`** — Add `category_changed?: boolean` to `DraftExpense`
- **`src/pages/UploadStatement.tsx`** — Add `Select` dropdown per transaction row for category editing; on change update draft state with new category + set `category_changed = true`; in `handleSaveAll`, after bulk insert, upsert corrections into `category_learning`

### UI behavior

Each transaction card in Step 4 will show the category name as a `Select` component (compact, inline). Tapping it reveals the full category list. Changing it visually updates the card. On save, corrections feed into the learning table so future AI categorizations improve.

