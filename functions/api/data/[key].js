// Cloudflare Pages Function — /api/data/:key
// GET: Public read — returns a single key's data
// POST: Authenticated write — saves a single key's data
// Uses Cloudflare KV namespace bound as PORTFOLIO_DATA

const ALLOWED_KEYS = new Set([
  'trades', 'journal', 'thinkPieces', 'watchlist', 'snapshots',
  'settings', 'priceStore', 'priceCache'
]);

export async function onRequestGet(context) {
  const key = context.params.key;
  if (!ALLOWED_KEYS.has(key)) return jsonResp({ error: 'Invalid key' }, 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  try {
    const val = await kv.get(key, 'json');
    return jsonResp(val !== null ? val : null);
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const key = context.params.key;
  if (!ALLOWED_KEYS.has(key)) return jsonResp({ error: 'Invalid key' }, 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  if (!isAuthorized(context)) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await context.request.json();
    await kv.put(key, JSON.stringify(body));
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
