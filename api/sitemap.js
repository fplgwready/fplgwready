export default async function handler(req, res) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(
    `${SB_URL}/rest/v1/gw_articles?is_published=eq.true&select=slug,published_at&order=published_at.desc`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const articles = r.ok ? await r.json() : [];
  const base = 'https://fplgwready.vercel.app';
  const pages = ['/', '/team.html', '/insight.html', '/challenge.html', '/community.html', '/mini-league.html', '/players.html'];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  pages.forEach(p => { xml += `  <url><loc>${base}${p}</loc></url>\n`; });
  articles.forEach(a => {
    xml += `  <url><loc>${base}/insight.html?article=${encodeURIComponent(a.slug)}</loc>`;
    if (a.published_at) xml += `<lastmod>${a.published_at.split('T')[0]}</lastmod>`;
    xml += `</url>\n`;
  });
  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).send(xml);
}
