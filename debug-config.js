export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  // 環境変数チェック
  const envCheck = {
    KV_URL: !!KV_URL,
    KV_TOKEN: !!KV_TOKEN,
    ANTHROPIC_KEY: !!ANTHROPIC_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET
  };

  // KVから設定を読む
  let autoConfig = null;
  let kvError = null;
  try {
    const r = await fetch(`${KV_URL}/get/auto_post_config`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d = await r.json();
    autoConfig = d.result ? JSON.parse(d.result) : null;
  } catch(e) {
    kvError = e.message;
  }

  // JST現在時刻
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);

  res.status(200).json({
    envCheck,
    kvError,
    jstTime: `${jst.getUTCHours()}:${String(jst.getUTCMinutes()).padStart(2,'0')}`,
    autoConfigExists: !!autoConfig,
    enabledChars: autoConfig ? autoConfig.filter(c => c.enabled && c.token).map(c => ({
      name: c.name,
      enabled: c.enabled,
      hasToken: !!c.token,
      dailyCount: c.dailyCount
    })) : []
  });
}
