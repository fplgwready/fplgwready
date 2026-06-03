export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  return res.status(200).json({
    url: process.env.SUPABASE_URL || 'https://ejbxrajfvqegruvgfsct.supabase.co',
    key: process.env.SUPABASE_KEY
  });
}
