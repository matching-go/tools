export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, text } = req.body;

    const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${token}`);
    const me = await meRes.json();
    if (!me.id) throw new Error('Invalid token: ' + JSON.stringify(me));

    const createRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'TEXT', text, access_token: token })
    });
    const created = await createRes.json();
    if (!created.id) throw new Error('Create failed: ' + JSON.stringify(created));

    await new Promise(r => setTimeout(r, 1500));

    const pubRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: token })
    });
    const pub = await pubRes.json();
    
    res.status(200).json({ ok: true, id: pub.id });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
