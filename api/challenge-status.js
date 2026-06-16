export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { gw } = req.query;
  if (!gw) return res.status(400).json({ error: 'gw required' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    const r = await fetch(`${SB_URL}/rest/v1/challenge_config?gw=eq.${gw}&select=is_open&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    const rows = r.ok ? await r.json() : [];
    const is_open = rows.length > 0 ? rows[0].is_open : true;
    res.json({ is_open });
  } catch (e) {
    res.json({ is_open: true });
  }
}
