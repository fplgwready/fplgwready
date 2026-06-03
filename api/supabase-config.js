export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (!process.env.SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_KEY env var is not set in Vercel' });
  }
  return res.status(200).json({
    url: process.env.SUPABASE_URL || 'https://ejbxrajfvqegruvgfsct.supabase.co',
    key: process.env.SUPABASE_KEY
  });
}
