export default async function handler(req, res) {
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const { gw } = req.query;
    if (!gw) return res.status(400).json({ error: 'gw required' });

    const [entriesRes, pairsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/challenge_entries?gw=eq.${gw}&select=*&order=created_at.asc&limit=2000`, { headers: base }),
      fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=id.asc&limit=3`, { headers: base })
    ]);

    if (!entriesRes.ok) return res.status(500).json({ error: 'Could not fetch entries' });
    const entries = await entriesRes.json();
    const pairs = pairsRes.ok ? await pairsRes.json() : [];
    const unique_game1_picks = [...new Set(entries.filter(e => e.game_type === 'top_score').map(e => e.prediction))];

    return res.json({ entries, pairs, unique_game1_picks });
  }

  if (req.method === 'POST') {
    const { gw, top_scorer_pts, player_pts, hidden_gem_winner, tot_results } = req.body || {};
    if (!gw) return res.status(400).json({ error: 'gw required' });

    const [entriesRes, pairsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/challenge_entries?gw=eq.${gw}&select=id,game_type,prediction&limit=2000`, { headers: base }),
      fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=id.asc&limit=3`, { headers: base })
    ]);

    if (!entriesRes.ok) return res.status(500).json({ error: 'Could not fetch entries' });
    const entries = await entriesRes.json();
    const pairs = pairsRes.ok ? await pairsRes.json() : [];

    const updates = entries.map(entry => {
      let score = 0;
      if (entry.game_type === 'top_score') {
        const actualPts = ((player_pts || {})[entry.prediction] ?? 0);
        score = top_scorer_pts > 0 ? Math.round((actualPts / top_scorer_pts) * 40) : 0;
      } else if (entry.game_type === 'hidden_gem') {
        score = entry.prediction === hidden_gem_winner ? 30 : 0;
      } else if (entry.game_type.startsWith('this_or_that_')) {
        const pairIdx = parseInt(entry.game_type.split('_').pop()) - 1;
        const result = (tot_results || [])[pairIdx];
        const pair = pairs[pairIdx];
        if (result === 'TIE') {
          score = 10;
        } else if (pair && result === 'A' && entry.prediction === pair.player_a) {
          score = 10;
        } else if (pair && result === 'B' && entry.prediction === pair.player_b) {
          score = 10;
        }
      }
      return { id: entry.id, score };
    });

    await Promise.all(updates.map(({ id, score }) =>
      fetch(`${SB_URL}/rest/v1/challenge_entries?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...base, Prefer: 'return=minimal' },
        body: JSON.stringify({ score })
      })
    ));

    return res.json({ updated: updates.length });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
