export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  // Public — anyone can submit feedback, no admin header required
  if (req.method === 'POST') {
    const { message, page } = req.body || {};
    const trimmed = (message || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'message required' });
    if (trimmed.length > 2000) return res.status(400).json({ error: 'message too long' });
    const r = await fetch(`${SB_URL}/rest/v1/site_feedback`, {
      method: 'POST',
      headers: { ...base, Prefer: 'return=minimal' },
      // Stamp created_at explicitly in unambiguous UTC (ISO 8601 with Z) instead
      // of relying on the DB's `now()` default, whose serialized offset depends
      // on the Postgres session timezone and was showing up shifted by the
      // project's local offset (e.g. UTC+7 for Indonesia-based sessions).
      body: JSON.stringify({ message: trimmed, page: (page || '').slice(0, 300), created_at: new Date().toISOString() })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Insert failed' }); }
    return res.status(200).json({ ok: true });
  }

  // Admin auth required below
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const r = await fetch(`${SB_URL}/rest/v1/site_feedback?select=*&order=created_at.desc&limit=200`, { headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    return res.json(await r.json());
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await fetch(`${SB_URL}/rest/v1/site_feedback?id=eq.${id}`, { method: 'DELETE', headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
