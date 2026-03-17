// Cloudflare Pages Function — /api/yahoo
// Proxies requests to Yahoo Finance, runs on the same domain as the site.
// No CORS issues since it's same-origin.
//
// Usage: /api/yahoo?url=https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d

const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];

export async function onRequest(context) {
  const { request } = context;

  // Handle preflight (shouldn't be needed since same-origin, but just in case)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing ?url= parameter' }, 400, request);
  }

  // Security: only allow Yahoo Finance domains
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonResponse({ error: 'Invalid URL' }, 400, request);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return jsonResponse({ error: `Domain not allowed: ${parsed.hostname}` }, 403, request);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YahooFinanceProxy/1.0)'
      }
    });

    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        ...corsHeaders(request),
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (e) {
    return jsonResponse({ error: `Fetch failed: ${e.message}` }, 502, request);
  }
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  });
}
