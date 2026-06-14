export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poll_id, voter_token, voted_option } = req.body || {};
  if (!poll_id || !voter_token || !['A', 'B'].includes(voted_option)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const authHeaders = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  // 1. Insert vote — 409 means already voted, which is fine
  const insertRes = await fetch(`${SB_URL}/rest/v1/poll_votes`, {
    method: 'POST',
    headers: { ...authHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ poll_id, voter_token, voted_option }),
  });

  if (!insertRes.ok && insertRes.status !== 409) {
    const body = await insertRes.json().catch(() => ({}));
    return res.status(insertRes.status).json({ error: body.message || 'Vote insert failed' });
  }

  const alreadyVoted = insertRes.status === 409;

  // 2. Count votes directly from poll_votes — always accurate, no race condition
  const votesRes = await fetch(
    `${SB_URL}/rest/v1/poll_votes?poll_id=eq.${poll_id}&select=voted_option`,
    { headers: authHeaders }
  );

  if (!votesRes.ok) {
    return res.status(500).json({ error: 'Failed to count votes' });
  }

  const votes = await votesRes.json();
  const votes_a = votes.filter(v => v.voted_option === 'A').length;
  const votes_b = votes.filter(v => v.voted_option === 'B').length;

  // 3. Update gw_polls cache with accurate counts (best effort, don't block response)
  fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${poll_id}`, {
    method: 'PATCH',
    headers: { ...authHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ votes_a, votes_b }),
  }).catch(() => {});

  return res.status(200).json({ votes_a, votes_b, already_voted: alreadyVoted });
}
