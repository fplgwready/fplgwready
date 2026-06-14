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
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // Insert vote (ignore duplicate — unique constraint on poll_id + voter_token)
  const insertRes = await fetch(`${SB_URL}/rest/v1/poll_votes`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ poll_id, voter_token, voted_option }),
  });

  // 409 = duplicate vote (already voted), still return current counts
  if (!insertRes.ok && insertRes.status !== 409) {
    return res.status(insertRes.status).json({ error: 'Vote insert failed' });
  }

  const alreadyVoted = insertRes.status === 409;

  // Increment the right column (only if new vote)
  if (!alreadyVoted) {
    const field = voted_option === 'A' ? 'votes_a' : 'votes_b';
    const rpcRes = await fetch(`${SB_URL}/rpc/increment_poll_vote`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ p_poll_id: poll_id, p_field: field }),
    });
    // If RPC doesn't exist, fall back to manual increment
    if (!rpcRes.ok) {
      const pollRes = await fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${poll_id}&select=votes_a,votes_b`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (pollRes.ok) {
        const [poll] = await pollRes.json();
        if (poll) {
          const newVal = (poll[field] || 0) + 1;
          await fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${poll_id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ [field]: newVal }),
          });
        }
      }
    }
  }

  // Return fresh counts
  const countRes = await fetch(`${SB_URL}/rest/v1/gw_polls?id=eq.${poll_id}&select=votes_a,votes_b`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!countRes.ok) return res.status(500).json({ error: 'Failed to fetch counts' });
  const [poll] = await countRes.json();
  return res.status(200).json({ votes_a: poll?.votes_a || 0, votes_b: poll?.votes_b || 0, already_voted: alreadyVoted });
}
