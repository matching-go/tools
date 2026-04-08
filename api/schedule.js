export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Vercel KV（環境変数）を使ってスケジュールを管理
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'KV not configured. Please set up Vercel KV.' });
    return;
  }

  const kvFetch = async (method, path, body) => {
    const r = await fetch(`${KV_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return r.json();
  };

  try {
    if (req.method === 'POST') {
      // スケジュール登録
      const { token, text, datetime, charName } = req.body;
      if (!token || !text || !datetime) {
        res.status(400).json({ error: 'token, text, datetime are required' });
        return;
      }
      const id = 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const schedule = { id, token, text, datetime, charName, createdAt: new Date().toISOString() };

      // KVに保存（リストに追加）
      await kvFetch('POST', '/lpush/schedules', { value: JSON.stringify(schedule) });

      res.status(200).json({ ok: true, id });

    } else if (req.method === 'GET') {
      // スケジュール一覧取得
      const data = await kvFetch('GET', '/lrange/schedules/0/100');
      const schedules = (data.result || []).map(s => {
        try { return JSON.parse(s); } catch(e) { return null; }
      }).filter(Boolean);
      res.status(200).json({ ok: true, schedules });

    } else if (req.method === 'DELETE') {
      // スケジュール削除
      const { id } = req.body;
      const data = await kvFetch('GET', '/lrange/schedules/0/100');
      const schedules = (data.result || []).map(s => { try { return JSON.parse(s); } catch(e) { return null; } }).filter(Boolean);
      const target = schedules.find(s => s.id === id);
      if (target) {
        await kvFetch('POST', '/lrem/schedules', { count: 1, element: JSON.stringify(target) });
      }
      res.status(200).json({ ok: true });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
