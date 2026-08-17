export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const BASE = 'https://fantasy.premierleague.com/api';
  const allowed = [
    /^entry\/\d+\/$/,
    /^entry\/\d+\/history\/$/,
    /^entry\/\d+\/event\/\d+\/picks\/$/,
    /^bootstrap-static\/$/,
    /^leagues-classic\/\d+\/standings\/(\?page_standings=\d+)?$/,
    /^event\/\d+\/live\/$/,
    /^fixtures\/$/,
  ];
  const isAllowed = allowed.some(r => r.test(endpoint));
  if (!isAllowed) return res.status(403).json({ error: 'Endpoint not allowed' });
  try {
    const response = await fetch(`${BASE}/${endpoint}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://fantasy.premierleague.com/',
        'Origin': 'https://fantasy.premierleague.com',
      }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'FPL API error', upstream_status: response.status });
    const data = await response.json();
    const isHeavy = endpoint.startsWith('bootstrap-static') || endpoint.startsWith('fixtures');
    res.setHeader('Cache-Control', isHeavy ? 's-maxage=300, stale-while-revalidate=3600' : 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: 'Failed to fetch from FPL' });
  }
}
