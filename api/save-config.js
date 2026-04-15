export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'KV not configured' });
    return;
  }

  try {
    // bodyを手動でパース
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }

    const config = body.config;
    if (!config) { res.status(400).json({ error: 'config required' }); return; }

    // Upstash Redis REST API
    const kvRes = await fetch(`${KV_URL}/set/auto_post_config`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([JSON.stringify(config)])
    });

    const kvData = await kvRes.json();
    res.status(200).json({ ok: true, kv: kvData });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
