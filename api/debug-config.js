export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ANTHROPIC_KEY: process.env.ANTHROPIC_KEY || 'NOT SET',
    CRON_SECRET: process.env.CRON_SECRET || 'NOT SET',
    KV_URL: process.env.KV_REST_API_URL ? 'SET' : 'NOT SET',
    all_keys: Object.keys(process.env).sort()
  });
}
