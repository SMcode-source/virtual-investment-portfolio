// Cloudflare Pages Function — /api/history/:ticker
// GET: Public read — returns cached price history for a ticker
// POST: Authenticated write — saves price history for a ticker
// Uses Cloudflare KV namespace bound as PORTFOLIO_DATA
// Keys stored as "history_SPY", "history_QQQ", etc.

export async function onRequestGet(context) {
  const ticker = context.params.ticker;
  if (!ticker) return jsonResp({ error: 'Missing ticker' }, 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  try {
    const val = await kv.get(`history_${ticker}`, 'json');
    return jsonResp(val !== null ? val : null);
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const ticker = context.params.ticker;
  if (!ticker) return jsonResp({ error: 'Missing ticker' }, 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  if (!isAuthorized(context)) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await context.request.json();
    await kv.put(`history_${ticker}`, JSON.stringify(body));
    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

function isAuthorized(context) {
  const secret = context.env.SYNC_SECRET;
  if (!secret) return false;
  const auth = context.request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
