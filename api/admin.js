export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  // ── Public: vote-poll ────────────────────────────────────────────────────────
  if (action === 'vote-poll') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { poll_id, voter_token, voted_option } = req.body || {};
    if (!poll_id || !voter_token || !['A', 'B'].includes(voted_option)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const insertRes = await fetch(`${SB_URL}/rest/v1/poll_votes`, {
      method: 'POST',
      headers: { ...base, Prefer: 'return=minimal' },
      body: JSON.stringify({ poll_id, voter_token, voted_option }),
    });
    if (!insertRes.ok && insertRes.status !== 409) {
      const body = await insertRes.json().catch(() => ({}));
      return res.status(insertRes.status).json({ error: body.message || 'Vote insert failed' });
    }
    const alreadyVoted = insertRes.status === 409;
    const votesRes = await fetch(
      `${SB_URL}/rest/v1/poll_votes?poll_id=eq.${poll_id}&select=voted_option`,
      { headers: base }
    );
    if (!votesRes.ok) return res.status(500).json({ error: 'Failed to count votes' });
    const votes = await votesRes.json();
    const votes_a = votes.filter(v => v.voted_option === 'A').length;
    const votes_b = votes.filter(v => v.voted_option === 'B').length;
    fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${poll_id}`, {
      method: 'PATCH',
      headers: { ...base, Prefer: 'return=minimal' },
      body: JSON.stringify({ votes_a, votes_b }),
    }).catch(() => {});
    return res.status(200).json({ votes_a, votes_b, already_voted: alreadyVoted });
  }

  // ── Admin auth required for all actions below ────────────────────────────────
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  // ── create-poll ──────────────────────────────────────────────────────────────
  if (action === 'create-poll') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { type, question, option_a, option_b, gw } = req.body || {};
    if (!type || !question || !option_a || !option_b || !gw) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const r = await fetch(`${SB_URL}/rest/v1/gw_polls`, {
      method: 'POST',
      headers: { ...base, Prefer: 'return=representation' },
      body: JSON.stringify({ type, question, option_a, option_b, gw, is_active: true, votes_a: 0, votes_b: 0 }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'DB error' });
    const rows = await r.json();
    return res.status(200).json(rows[0]);
  }

  // ── close-poll ───────────────────────────────────────────────────────────────
  if (action === 'close-poll') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing poll id' });
    const r = await fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...base },
      body: JSON.stringify({ is_active: false }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'DB error' });
    return res.status(200).json({ ok: true });
  }

  // ── this-or-that ─────────────────────────────────────────────────────────────
  if (action === 'this-or-that') {
    if (req.method === 'GET') {
      const { gw } = req.query;
      if (!gw) return res.status(400).json({ error: 'gw required' });
      const r = await fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=pair_num.asc.nullslast,id.asc&limit=20`, { headers: base });
      if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
      return res.json(await r.json());
    }
    if (req.method === 'POST') {
      const { gw, player_a, player_b } = req.body || {};
      if (!gw || !player_a || !player_b) return res.status(400).json({ error: 'gw, player_a, player_b required' });
      const existingRes = await fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${parseInt(gw)}&select=pair_num&order=pair_num.desc.nullslast&limit=1`, { headers: base });
      const existing = existingRes.ok ? await existingRes.json() : [];
      const pair_num = (existing[0]?.pair_num || 0) + 1;
      const r = await fetch(`${SB_URL}/rest/v1/this_or_that`, {
        method: 'POST',
        headers: { ...base, Prefer: 'return=representation' },
        body: JSON.stringify({ gw: parseInt(gw), player_a: player_a.trim(), player_b: player_b.trim(), pair_num }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Insert failed' }); }
      const rows = await r.json();
      return res.json(rows[0]);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await fetch(`${SB_URL}/rest/v1/this_or_that?id=eq.${id}`, { method: 'DELETE', headers: base });
      if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── captain-bracket ──────────────────────────────────────────────────────────
  if (action === 'captain-bracket') {
    if (req.method === 'GET') {
      const { gw } = req.query;
      if (!gw) return res.status(400).json({ error: 'gw required' });
      const r = await fetch(`${SB_URL}/rest/v1/captain_brackets?gw=eq.${gw}&order=slot.asc&limit=2`, { headers: base });
      if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
      return res.json(await r.json());
    }
    if (req.method === 'POST') {
      const { gw, player_name, slot } = req.body || {};
      if (!gw || !player_name || !slot) return res.status(400).json({ error: 'gw, player_name, slot required' });
      const r = await fetch(`${SB_URL}/rest/v1/captain_brackets`, {
        method: 'POST',
        headers: { ...base, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ gw: parseInt(gw), player_name: player_name.trim(), slot: parseInt(slot) }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Insert failed' }); }
      const rows = await r.json();
      return res.json(rows[0]);
    }
    if (req.method === 'DELETE') {
      const { gw, slot } = req.body || {};
      if (!gw || !slot) return res.status(400).json({ error: 'gw and slot required' });
      const r = await fetch(`${SB_URL}/rest/v1/captain_brackets?gw=eq.${gw}&slot=eq.${slot}`, {
        method: 'DELETE',
        headers: base,
      });
      if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
