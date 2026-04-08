export default async function handler(req, res) {
  // Vercel Cronからのみ実行を許可
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'KV not configured' });
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
    // スケジュール一覧取得
    const data = await kvFetch('GET', '/lrange/schedules/0/100');
    const schedules = (data.result || []).map(s => { try { return JSON.parse(s); } catch(e) { return null; } }).filter(Boolean);

    const now = new Date();
    const results = [];

    for (const sched of schedules) {
      const schedTime = new Date(sched.datetime);
      // 投稿時刻を過ぎていたら投稿実行
      if (schedTime <= now) {
        try {
          // Threads APIに投稿
          const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${sched.token}`);
          const me = await meRes.json();
          if (!me.id) throw new Error('Invalid token');

          const createRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_type: 'TEXT', text: sched.text, access_token: sched.token })
          });
          const created = await createRes.json();
          if (!created.id) throw new Error('Create failed: ' + JSON.stringify(created));

          await new Promise(r => setTimeout(r, 1500));

          const pubRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creation_id: created.id, access_token: sched.token })
          });
          const pub = await pubRes.json();

          // 投稿済みをKVから削除
          await kvFetch('POST', '/lrem/schedules', { count: 1, element: JSON.stringify(sched) });
          results.push({ id: sched.id, charName: sched.charName, status: 'posted', threadId: pub.id });

        } catch(e) {
          results.push({ id: sched.id, charName: sched.charName, status: 'error', error: e.message });
        }
      }
    }

    res.status(200).json({ ok: true, processed: results.length, results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
