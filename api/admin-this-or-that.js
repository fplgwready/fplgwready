export default async function handler(req, res) {
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const { gw } = req.query;
    if (!gw) return res.status(400).json({ error: 'gw required' });
    const r = await fetch(`${SB_URL}/rest/v1/this_or_that?gw=eq.${gw}&order=id.asc&limit=20`, { headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    return res.json(await r.json());
  }

  if (req.method === 'POST') {
    const { gw, player_a, player_b } = req.body || {};
    if (!gw || !player_a || !player_b) return res.status(400).json({ error: 'gw, player_a, player_b required' });
    const r = await fetch(`${SB_URL}/rest/v1/this_or_that`, {
      method: 'POST',
      headers: { ...base, Prefer: 'return=representation' },
      body: JSON.stringify({ gw: parseInt(gw), player_a: player_a.trim(), player_b: player_b.trim() })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Insert failed' }); }
    const rows = await r.json();
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await fetch(`${SB_URL}/rest/v1/this_or_that?id=eq.${id}`, {
      method: 'DELETE',
      headers: base
    });
    if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
