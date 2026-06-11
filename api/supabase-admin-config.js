export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pw = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(200).json({ ok: true });
}
