// Runs on Vercel's Edge Runtime instead of Node serverless — the Node
// functions' outbound IPs (shared AWS ranges) are being blocked with a 403
// by FPL/Cloudflare, while direct requests from elsewhere succeed. Edge
// functions route through a different network path that isn't blocked.
export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS });

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) return json({ error: 'Missing endpoint' }, 400);

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
  if (!isAllowed) return json({ error: 'Endpoint not allowed' }, 403);

  try {
    const response = await fetch(`${BASE}/${endpoint}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://fantasy.premierleague.com/',
        'Origin': 'https://fantasy.premierleague.com',
      },
    });
    if (!response.ok) return json({ error: 'FPL API error', upstream_status: response.status }, response.status);
    const data = await response.json();
    // bootstrap-static/fixtures barely change within a GW — cache those
    // longer. Everything else (live scores, picks, entry summaries,
    // league standings) changes minute-to-minute during a live GW —
    // e.g. bonus points ticking up — so keep that window short instead
    // of the old 60s, which was noticeably stale (a manager's live GW
    // total was 2 points behind reality mid-bonus-calculation).
    const isHeavy = endpoint.startsWith('bootstrap-static') || endpoint.startsWith('fixtures');
    return json(data, 200, {
      'Cache-Control': isHeavy ? 's-maxage=300, stale-while-revalidate=3600' : 's-maxage=10, stale-while-revalidate=30',
    });
  } catch (e) {
    return json({ error: 'Failed to fetch from FPL' }, 500);
  }
}
