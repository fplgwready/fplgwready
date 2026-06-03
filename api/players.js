export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  try {
    const r = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'FPL API error' });
    const data = await r.json();

    const teamMap = {};
    (data.teams || []).forEach(t => { teamMap[t.id] = t.short_name; });

    const events = data.events || [];
    const gw = events.find(e => e.is_current)?.id
      || events.find(e => e.is_next)?.id
      || events.filter(e => e.finished).pop()?.id
      || 38;

    const players = (data.elements || [])
      .filter(p => p.status !== 'u')
      .map(p => ({
        n: p.web_name,
        t: teamMap[p.team] || '',
        p: p.element_type,
        c: p.now_cost,
        x: parseFloat(p.ep_this) || 0
      }))
      .sort((a, b) => b.x - a.x);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ gw, players });
  } catch(e) {
    return res.status(500).json({ error: 'Failed to fetch from FPL' });
  }
}
