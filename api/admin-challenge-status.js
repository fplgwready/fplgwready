export default async function handler(req, res) {
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const { gw } = req.query;
    if (!gw) return res.status(400).json({ error: 'gw required' });
    const r = await fetch(`${SB_URL}/rest/v1/challenge_config?gw=eq.${gw}&select=*&limit=1`, { headers: base });
    const rows = r.ok ? await r.json() : [];
    return res.json(rows[0] || { gw: parseInt(gw), is_open: true });
  }

  if (req.method === 'POST') {
    const { gw, is_open } = req.body || {};
    if (!gw) return res.status(400).json({ error: 'gw required' });
    const r = await fetch(`${SB_URL}/rest/v1/challenge_config`, {
      method: 'POST',
      headers: { ...base, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ gw: parseInt(gw), is_open: !!is_open })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Update failed' }); }
    const rows = await r.json();
    return res.json(rows[0] || { gw, is_open: !!is_open });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
