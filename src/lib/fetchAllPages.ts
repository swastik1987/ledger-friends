// PostgREST (Supabase) caps any single response at a default 1000 rows. For
// queries that can legitimately exceed that — e.g. all expenses in a busy
// tracker — we page through with `.range(from, to)` until a short page signals
// the end. `makeQuery` must apply a STABLE order (including a unique tiebreaker
// like id) so rows don't shift between page boundaries.

const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard stop guards against an unstable order causing a non-terminating loop.
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
