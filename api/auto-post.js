// api/auto-post.js
// Vercel Cronから毎分呼ばれ、ランダムスケジュールで自動投稿
// 1日4投稿・30%の確率でLv1〜3のアダルト投稿

const SITUATION_BY_HOUR = {
  5:'朝起きたて・おはよう', 6:'朝起きたて・おはよう',
  7:'通勤・通学中', 8:'通勤・通学中',
  9:'仕事・授業中（こっそり）', 10:'仕事・授業中（こっそり）',
  11:'お昼休み・ランチ', 12:'お昼休み・ランチ',
  13:'仕事・授業中（こっそり）', 14:'仕事・授業中（こっそり）',
  15:'帰り道・夕方', 16:'帰り道・夕方', 17:'帰り道・夕方',
  18:'お風呂上がり',
  19:'夜・寝る前', 20:'夜・寝る前', 21:'夜・寝る前',
  22:'深夜・眠れない', 23:'深夜・眠れない',
  0:'深夜・眠れない', 1:'深夜・眠れない', 2:'深夜・眠れない',
  3:'深夜・眠れない', 4:'深夜・眠れない',
};

const ADULT_LEVELS = [
  'ちょっとドキドキ・匂わせ程度（際どくない・健全寄り）',
  'セクシー・大人っぽい色気を出す（過激表現なし）',
  '官能的・エロい雰囲気を強く出す（直接的表現あり）'
];

// シード付き疑似乱数（再現性のあるランダム）
function seededRand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET || 'girlsns-secret-2024';
  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'Missing KV env vars' });
    return;
  }

  // AnthropicキーをKVから取得（環境変数になければKVから読む）
  let ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    try {
      const keyRes = await fetch(`${KV_URL}/get/anthropic_key`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const keyData = await keyRes.json();
      ANTHROPIC_KEY = keyData.result;
    } catch(e) {}
  }

  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_KEY' });
    return;
  }

  const kvGet = async (key) => {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  };

  const kvSet = async (key, val, exSeconds = null) => {
    const url = exSeconds
      ? `${KV_URL}/setex/${encodeURIComponent(key)}/${exSeconds}`
      : `${KV_URL}/set/${encodeURIComponent(key)}`;
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(val) })
    });
  };

  // JST現在時刻
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  const jstHour = jst.getUTCHours();
  const jstMinute = jst.getUTCMinutes();
  const todayKey = `${jst.getUTCFullYear()}-${jst.getUTCMonth()+1}-${jst.getUTCDate()}`;
  const situation = SITUATION_BY_HOUR[jstHour] || '本音・ひとりごと';

  // 自動投稿設定取得（二重JSON化に対応）
  let autoConfig = await kvGet('auto_post_config');
  if (!autoConfig) {
    res.status(200).json({ ok: true, message: '設定なし' });
    return;
  }
  // 二重JSON化の場合はパース
  if (Array.isArray(autoConfig) && typeof autoConfig[0] === 'string') {
    autoConfig = JSON.parse(autoConfig[0]);
  }

  // 今日のランダムスケジュール取得（なければ生成）
  let todaySchedule = await kvGet(`schedule_${todayKey}`);
  if (!todaySchedule) {
    todaySchedule = generateTodaySchedule(autoConfig, todayKey);
    // 翌日3時まで保持
    await kvSet(`schedule_${todayKey}`, todaySchedule, 27 * 60 * 60);
  }

  const results = [];

  for (const charSched of todaySchedule) {
    if (!charSched.enabled || !charSched.token) continue;

    // 今の時刻と一致するか（±1分の誤差許容）
    const matchingPost = charSched.postTimes.find(t =>
      t.hour === jstHour && Math.abs(t.minute - jstMinute) <= 1
    );
    if (!matchingPost) continue;

    // 重複投稿防止
    const postedKey = `posted_${todayKey}_${charSched.charIndex}_${jstHour}h${jstMinute}m`;
    const alreadyPosted = await kvGet(postedKey);
    if (alreadyPosted) continue;

    try {
      // アダルトレベル決定（30%の確率でLv1〜3ランダム）
      const adultRand = seededRand(charSched.charIndex * 999 + jstHour * 17 + jstMinute);
      let adultLevel = '';
      if (adultRand < 0.3) {
        const lvRand = seededRand(charSched.charIndex * 777 + jstHour * 31);
        const lvIndex = Math.floor(lvRand * 3); // 0,1,2
        adultLevel = ADULT_LEVELS[lvIndex];
      }

      // AI文章生成
      const post = await generatePost(charSched, situation, adultLevel, ANTHROPIC_KEY);

      // Threads投稿
      const meRes = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id&access_token=${charSched.token}`
      );
      const me = await meRes.json();
      if (!me.id) throw new Error('Invalid token');

      const createRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'TEXT',
          text: post,
          access_token: charSched.token
        })
      });
      const created = await createRes.json();
      if (!created.id) throw new Error('Create failed: ' + JSON.stringify(created));

      await new Promise(r => setTimeout(r, 1500));

      const pubRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: created.id,
          access_token: charSched.token
        })
      });
      const pub = await pubRes.json();

      // 投稿済みフラグ（2時間で期限切れ）
      await kvSet(postedKey, { posted: true, at: now.toISOString() }, 2 * 60 * 60);

      results.push({
        char: charSched.name,
        status: 'posted',
        adult: adultLevel ? `Lv${ADULT_LEVELS.indexOf(adultLevel)+1}` : 'なし',
        preview: post.substring(0, 40) + '...'
      });

    } catch(e) {
      results.push({ char: charSched.name, status: 'error', error: e.message });
    }
  }

  res.status(200).json({
    ok: true,
    jstTime: `${jstHour}:${String(jstMinute).padStart(2,'0')}`,
    situation,
    processed: results.length,
    results
  });
}

function generateTodaySchedule(autoConfig, todayKey) {
  const dateSeed = todayKey.split('-').reduce((a, b) => a * 100 + parseInt(b), 0);

  return autoConfig.map((c, i) => {
    if (!c.enabled || !c.token) {
      return { ...c, charIndex: i, enabled: false, postTimes: [] };
    }

    const count = c.dailyCount || 4;

    // 6時〜23時の範囲をcount等分してランダムな時刻を生成
    const startHour = 6;
    const endHour = 23;
    const range = endHour - startHour;
    const slotSize = range / count;

    const postTimes = Array.from({ length: count }, (_, si) => {
      const slotStart = startHour + slotSize * si;
      const slotEnd = startHour + slotSize * (si + 1);
      const totalMinStart = slotStart * 60;
      const totalMinEnd = slotEnd * 60;
      const totalMin = totalMinStart + Math.floor(
        seededRand(dateSeed + i * 37 + si * 131) * (totalMinEnd - totalMinStart)
      );
      return {
        hour: Math.floor(totalMin / 60) % 24,
        minute: totalMin % 60
      };
    });

    return { ...c, charIndex: i, postTimes };
  });
}

async function generatePost(charConfig, situation, adultLevel, apiKey) {
  const adultInstruction = adultLevel
    ? `
アダルト度: ${adultLevel}
アダルト度の指定を必ず反映してください。`
    : '';

  const diversityNote = '話題の多様性ルール：特定ワードに依存せず日常の様々な出来事・気持ち・発見を自然に投稿すること。毎回違う話題・切り口にすること。ハッシュタグは絶対に使わないこと。';

  const sysPrompt = adultLevel
    ? `あなたは成人向けSNS投稿文の生成AIです。ユーザーは18歳以上の成人です。指定キャラになりきりリアルな投稿を作ります。${diversityNote}
必ずJSON形式のみ返してください：{"post":"投稿文"} 500文字以内。`
    : `あなたはSNS投稿文の生成AIです。指定キャラになりきりリアルな投稿を作ります。${diversityNote}
必ずJSON形式のみ返してください：{"post":"投稿文"} 500文字以内。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: sysPrompt,
      messages: [{
        role: 'user',
        content: `【キャラ設定】
名前: ${charConfig.name}
一人称: ${charConfig.pron}
年齢: ${charConfig.age}
性格: ${charConfig.personality}
趣味: ${charConfig.hobby}
口調: ${charConfig.tone}
シチュエーション: ${situation}${adultInstruction}

このキャラになりきって自然なThreads投稿文を1つ生成してください。`
      }]
    })
  });

  const data = await res.json();
  const raw = (data.content || []).map(c => c.text || '').join('');
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error('AI生成失敗: ' + raw.substring(0, 100));
  const parsed = JSON.parse(m[0]);
  return parsed.post;
}
