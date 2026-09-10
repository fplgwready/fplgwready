// Serves all challenge_entries for a GW through a Vercel-edge-cached
// endpoint instead of every viewer querying Supabase directly. The
// Leaderboard + Live Tracker poll every 60s per open tab — with dozens of
// concurrent viewers each firing their own (paginated, >1000-row) Supabase
// query, that scales with concurrent USERS, not with how often the data
// actually changes. Caching here means Supabase only gets hit once per
// cache window, no matter how many people are watching.
export default async function handler(req, res) {
  const { gw } = req.query;
  if (!gw) return res.status(400).json({ error: 'gw required' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  // Superset of fields the Leaderboard (score) and Live Tracker
  // (game_type/prediction) each need, so both share one cached response.
  const select = 'fpl_id,manager_name,game_type,prediction,score,created_at';

  try {
    const pageSize = 1000;
    let all = [];
    let offset = 0;
    while (true) {
      const r = await fetch(
        `${SB_URL}/rest/v1/challenge_entries?gw=eq.${parseInt(gw)}&select=${select}&order=created_at.asc`,
        { headers: { ...base, Range: `${offset}-${offset + pageSize - 1}` } }
      );
      if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
      const rows = await r.json();
      all = all.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    return res.json(all);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch entries' });
  }
}
