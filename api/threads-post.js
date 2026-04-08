export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { token, text, imageUrls } = req.body;

    // ユーザーID取得
    const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${token}`);
    const me = await meRes.json();
    if (!me.id) throw new Error('Invalid token: ' + JSON.stringify(me));

    let creationId;

    if (imageUrls && imageUrls.length > 0) {
      // URLの形式チェック
      for (const url of imageUrls) {
        if (!url.startsWith('https://')) {
          throw new Error('画像URLはhttpsである必要があります: ' + url);
        }
      }

      if (imageUrls.length === 1) {
        // 画像1枚 - textは別フィールドとして渡す
        const createBody = {
          media_type: 'IMAGE',
          image_url: imageUrls[0],
          access_token: token
        };
        if (text) createBody.text = text;

        const createRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody)
        });
        const created = await createRes.json();
        if (!created.id) throw new Error('画像投稿失敗: ' + JSON.stringify(created));
        creationId = created.id;

      } else {
        // 複数画像 → カルーセル
        // Step1: 各画像のコンテナを作成
        const itemIds = [];
        for (const url of imageUrls) {
          const itemRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media_type: 'IMAGE',
              image_url: url,
              is_carousel_item: true,
              access_token: token
            })
          });
          const item = await itemRes.json();
          if (!item.id) throw new Error('Carousel item failed: ' + JSON.stringify(item));
          itemIds.push(item.id);
        }

        // Step2: カルーセルコンテナ作成
        const carouselRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: itemIds.join(','),
            text,
            access_token: token
          })
        });
        const carousel = await carouselRes.json();
        if (!carousel.id) throw new Error('Carousel failed: ' + JSON.stringify(carousel));
        creationId = carousel.id;
      }
    } else {
      // テキストのみ
      const createRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'TEXT', text, access_token: token })
      });
      const created = await createRes.json();
      if (!created.id) throw new Error('Create failed: ' + JSON.stringify(created));
      creationId = created.id;
    }

    // 公開
    await new Promise(r => setTimeout(r, 1500));
    const pubRes = await fetch(`https://graph.threads.net/v1.0/${me.id}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token })
    });
    const pub = await pubRes.json();

    res.status(200).json({ ok: true, id: pub.id });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
