export default async function handler(req, res) {
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

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
      body: JSON.stringify({ gw: parseInt(gw), player_name: player_name.trim(), slot: parseInt(slot) })
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
      headers: base
    });
    if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
