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
    const { config } = req.body;
    if (!config) { res.status(400).json({ error: 'config required' }); return; }

    // Upstash Redis REST API - 正しい形式で保存
    const kvRes = await fetch(`${KV_URL}/set/auto_post_config`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([JSON.stringify(config)])
    });

    const kvData = await kvRes.json();
    if (kvData.result === 'OK') {
      res.status(200).json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: JSON.stringify(kvData) });
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
