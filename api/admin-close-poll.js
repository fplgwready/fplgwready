export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const pw = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing poll id' });

  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/gw_polls`);
  url.searchParams.set('id', `eq.${id}`);

  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ is_active: false })
  });
  if (!r.ok) return res.status(r.status).json({ error: 'DB error' });
  return res.status(200).json({ ok: true });
}
