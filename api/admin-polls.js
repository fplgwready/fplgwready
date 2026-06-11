export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pw = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/gw_polls`);
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('order', 'created_at.desc');

  const r = await fetch(url, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  });
  if (!r.ok) return res.status(r.status).json({ error: 'DB error' });
  return res.status(200).json(await r.json());
}
