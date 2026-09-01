function getBracket(pts) {
  if (pts >= 13) return '13+';
  if (pts >= 9) return '9-12';
  if (pts >= 5) return '5-8';
  return '1-4';
}

// Supabase/PostgREST caps every response at 1000 rows (its db-max-rows
// setting) no matter what `limit` we pass in the query string — a GW with
// >~167 participants (>1000 challenge_entries rows, ~6 rows each) was
// silently missing everyone past that in both the Score Calculator and,
// critically, Confirm & Update Scores, so their score stayed 0 forever.
// Page through with the Range header until a response comes back short.
async function fetchAllRows(url, headers) {
  const pageSize = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const r = await fetch(url, { headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` } });
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const rows = await r.json();
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const { gw } = req.query;
    if (!gw) return res.status(400).json({ error: 'gw required' });

    let entries, pairsRes, bracketsRes, resultsRes;
    try {
      [entries, pairsRes, bracketsRes, resultsRes] = await Promise.all([
        fetchAllRows(`${SB_URL}/rest/v1/challenge_entries?gw=eq.${gw}&select=*&order=created_at.asc`, base),
        fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=pair_num.asc.nullslast,id.asc&limit=3`, { headers: base }),
        fetch(`${SB_URL}/rest/v1/captain_brackets?gw=eq.${gw}&order=slot.asc&limit=2`, { headers: base }),
        fetch(`${SB_URL}/rest/v1/challenge_gw_results?gw=eq.${gw}&select=*&limit=1`, { headers: base })
      ]);
    } catch (e) {
      return res.status(500).json({ error: 'Could not fetch entries' });
    }

    const pairs = pairsRes.ok ? await pairsRes.json() : [];
    const captain_brackets = bracketsRes.ok ? await bracketsRes.json() : [];
    const resultsRows = resultsRes.ok ? await resultsRes.json() : [];
    const gw_results = resultsRows[0] || null;
    const unique_game1_picks = [...new Set(entries.filter(e => e.game_type === 'top_score').map(e => e.prediction))];

    return res.json({ entries, pairs, captain_brackets, gw_results, unique_game1_picks });
  }

  if (req.method === 'POST') {
    const { gw, top_scorer, top_scorer_pts, player_pts, captain_pts, tot_results } = req.body || {};
    if (!gw) return res.status(400).json({ error: 'gw required' });

    let entries, pairsRes, bracketsRes;
    try {
      [entries, pairsRes, bracketsRes] = await Promise.all([
        fetchAllRows(`${SB_URL}/rest/v1/challenge_entries?gw=eq.${gw}&select=id,game_type,prediction`, base),
        fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=pair_num.asc.nullslast,id.asc&limit=3`, { headers: base }),
        fetch(`${SB_URL}/rest/v1/captain_brackets?gw=eq.${gw}&order=slot.asc&limit=2`, { headers: base })
      ]);
    } catch (e) {
      return res.status(500).json({ error: 'Could not fetch entries' });
    }

    const pairs = pairsRes.ok ? await pairsRes.json() : [];
    const captainBrackets = bracketsRes.ok ? await bracketsRes.json() : [];

    const updates = entries.map(entry => {
      let score = 0;
      if (entry.game_type === 'top_score') {
        const actualPts = ((player_pts || {})[entry.prediction] ?? 0);
        score = top_scorer_pts > 0 ? Math.round((actualPts / top_scorer_pts) * 40) : 0;
      } else if (entry.game_type.startsWith('captain_bracket_')) {
        const slotIdx = parseInt(entry.game_type.split('_').pop()) - 1;
        const bracketPlayer = captainBrackets[slotIdx];
        if (bracketPlayer) {
          const actualPts = ((captain_pts || {})[bracketPlayer.player_name] ?? 0);
          score = entry.prediction === getBracket(actualPts) ? 15 : 0;
        }
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

    // Firing 1000+ concurrent PATCH requests risks silent connection/rate-
    // limit failures with no clear signal of who got missed — batch them
    // and track which ones actually failed instead of assuming success.
    const batchSize = 100;
    let failed = 0;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(({ id, score }) =>
        fetch(`${SB_URL}/rest/v1/challenge_entries?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...base, Prefer: 'return=minimal' },
          body: JSON.stringify({ score })
        }).then(r => { if (!r.ok) throw new Error(`PATCH failed: ${r.status}`); })
      ));
      failed += results.filter(r => r.status === 'rejected').length;
    }

    // Remember what was typed into the calculator so reloading this GW later
    // (to double-check or correct a result) doesn't start from a blank form.
    await fetch(`${SB_URL}/rest/v1/challenge_gw_results?on_conflict=gw`, {
      method: 'POST',
      headers: { ...base, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        gw: parseInt(gw),
        top_scorer: top_scorer || null,
        top_scorer_pts: top_scorer_pts || null,
        player_pts: player_pts || {},
        captain_pts: captain_pts || {},
        tot_results: tot_results || [],
        updated_at: new Date().toISOString(),
      })
    });

    return res.json({ updated: updates.length - failed, failed, total: updates.length });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
