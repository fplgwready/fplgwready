export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pw = req.headers['x-admin-password'];
  if (pw !== 'fplgwready2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Service key not configured' });
  }
  return res.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY
  });
}
