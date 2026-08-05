import { supabase } from '../supabaseClient';

/**
 * Fetches all rows from a Supabase query by chunking requests in pages of 1000,
 * bypassing PostgREST's default max_rows limit of 1000.
 */
export async function fetchAllRows(fetchPageFn) {
  let allRows = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const from = page * pageSize;
    const to = (page + 1) * pageSize - 1;
    const { data, error } = await fetchPageFn(from, to);

    if (error) {
      console.error('Error fetching rows chunk:', error);
      break;
    }

    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  return allRows;
}

/**
 * Fetches all applications without 1000 limit.
 */
export async function fetchAllApplications(selectFields = '*') {
  return fetchAllRows((from, to) =>
    supabase
      .from('applications')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .range(from, to)
  );
}

/**
 * Fetches all teams without 1000 limit.
 */
export async function fetchAllTeams(selectFields = '*') {
  return fetchAllRows((from, to) =>
    supabase
      .from('teams')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .range(from, to)
  );
}
