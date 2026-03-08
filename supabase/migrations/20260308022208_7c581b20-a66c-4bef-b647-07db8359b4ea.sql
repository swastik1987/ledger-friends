INSERT INTO categories (name, icon, color, is_system, tracker_id)
SELECT name, icon, color, true, null
FROM (VALUES
  ('Salary / Income',    '💰', '#10B981'),
  ('Refund',             '🔄', '#06B6D4'),
  ('Reimbursement',      '💸', '#8B5CF6'),
  ('Cashback / Reward',  '🎁', '#F59E0B'),
  ('Interest Earned',    '🏦', '#3B82F6'),
  ('Other Income',       '📥', '#64748B')
) AS new_cats(name, icon, color)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.name = new_cats.name AND c.is_system = true
);