// Cloudflare Pages Function — /api/data
// GET: Public read — returns all portfolio data
// POST: Authenticated write — saves all portfolio data
// Uses Cloudflare KV namespace bound as PORTFOLIO_DATA
// Write auth: Bearer token must match SYNC_SECRET env var (= password hash)

const DATA_KEYS = ['trades', 'journal', 'thinkPieces', 'watchlist', 'snapshots', 'settings', 'priceStore', 'priceCache'];

export async function onRequestGet(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  const data = {};
  for (const key of DATA_KEYS) {
    try {
      const val = await kv.get(key, 'json');
      if (val !== null) data[key] = val;
    } catch (e) {
      console.error(`[data] Failed to read ${key}:`, e.message);
    }
  }
  return jsonResp(data);
}

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return jsonResp({ error: 'KV not configured' }, 500);

  if (!isAuthorized(context)) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400);
  }

  let written = 0;
  for (const key of DATA_KEYS) {
    if (body[key] !== undefined) {
      try {
        await kv.put(key, JSON.stringify(body[key]));
        written++;
      } catch (e) {
        console.error(`[data] Failed to write ${key}:`, e.message);
      }
    }
  }

  return jsonResp({ ok: true, keysWritten: written });
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
