export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const pw = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, question, option_a, option_b, gw } = req.body || {};
  if (!type || !question || !option_a || !option_b || !gw) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/gw_polls`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ type, question, option_a, option_b, gw, is_active: true, votes_a: 0, votes_b: 0 })
  });
  if (!r.ok) return res.status(r.status).json({ error: 'DB error' });
  const rows = await r.json();
  return res.status(200).json(rows[0]);
}
