export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // KVからanthropicキーとauto_post_configを取得
  let anthropicKey = 'NOT SET';
  let autoConfig = null;

  try {
    const r1 = await fetch(`${KV_URL}/get/anthropic_key`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d1 = await r1.json();
    if (d1.result) anthropicKey = 'SET (from KV)';

    const r2 = await fetch(`${KV_URL}/get/auto_post_config`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d2 = await r2.json();
    autoConfig = d2.result ? JSON.parse(d2.result) : null;
  } catch(e) {}

  res.status(200).json({
    anthropic_key_in_kv: anthropicKey,
    CRON_SECRET: process.env.CRON_SECRET || 'NOT SET',
    autoConfigExists: !!autoConfig,
    enabledChars: autoConfig
      ? autoConfig.filter(c => c.enabled && c.token).map(c => ({
          name: c.name,
          dailyCount: c.dailyCount
        }))
      : []
  });
}
