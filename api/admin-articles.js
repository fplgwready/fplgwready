export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const base = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  // Public GET — published articles only (no admin header)
  if (req.method === 'GET' && !req.headers['x-admin-password']) {
    const { slug, gw } = req.query;
    let url;
    if (slug) {
      url = `${SB_URL}/rest/v1/gw_articles?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=*&limit=1`;
    } else if (gw) {
      url = `${SB_URL}/rest/v1/gw_articles?gw=eq.${gw}&is_published=eq.true&select=id,gw,title,slug,cover_image,preview,author,published_at&order=published_at.desc&limit=20`;
    } else {
      url = `${SB_URL}/rest/v1/gw_articles?is_published=eq.true&select=id,gw,title,slug,cover_image,preview,author,published_at&order=published_at.desc&limit=50`;
    }
    const r = await fetch(url, { headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    const rows = await r.json();
    if (slug) return res.json(rows[0] || null);
    return res.json(rows);
  }

  // Admin auth required below
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const r = await fetch(`${SB_URL}/rest/v1/gw_articles?select=*&order=created_at.desc&limit=100`, { headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    return res.json(await r.json());
  }

  if (req.method === 'POST') {
    const { gw, title, slug, cover_image, preview, full_content, author, author_bio, is_published } = req.body || {};
    if (!title || !slug || !gw) return res.status(400).json({ error: 'title, slug, gw required' });
    const article = {
      gw: parseInt(gw), title: title.trim(), slug: slug.trim(),
      cover_image: (cover_image || '').trim(),
      preview: (preview || '').trim(), full_content: (full_content || '').trim(),
      author: (author || '').trim(), author_bio: (author_bio || '').trim(),
      is_published: !!is_published,
      published_at: is_published ? new Date().toISOString() : null
    };
    const r = await fetch(`${SB_URL}/rest/v1/gw_articles`, {
      method: 'POST',
      headers: { ...base, Prefer: 'return=representation' },
      body: JSON.stringify(article)
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Insert failed' }); }
    const rows = await r.json();
    return res.json(rows[0]);
  }

  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (fields.is_published && !fields.published_at) {
      fields.published_at = new Date().toISOString();
    }
    const r = await fetch(`${SB_URL}/rest/v1/gw_articles?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...base, Prefer: 'return=representation' },
      body: JSON.stringify(fields)
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: e.message || 'Update failed' }); }
    const rows = await r.json();
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await fetch(`${SB_URL}/rest/v1/gw_articles?id=eq.${id}`, { method: 'DELETE', headers: base });
    if (!r.ok) return res.status(500).json({ error: 'Delete failed' });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
