// Cloudflare Worker — CORS proxy for Yahoo Finance API
// Deploy: https://workers.cloudflare.com → Create Worker → paste this → Deploy
//
// Usage: https://YOUR-WORKER.workers.dev/?url=https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d
//
// Only proxies requests to Yahoo Finance domains. Returns proper CORS headers
// so browser-side JavaScript can fetch data directly.

const ALLOWED_ORIGINS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return json({ error: 'Missing ?url= parameter' }, 400, request);
    }

    // Security: only allow Yahoo Finance domains
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return json({ error: 'Invalid URL' }, 400, request);
    }

    if (!ALLOWED_ORIGINS.includes(parsed.hostname)) {
      return json({ error: `Domain not allowed: ${parsed.hostname}` }, 403, request);
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
      return json({ error: `Fetch failed: ${e.message}` }, 502, request);
    }
  }
};

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  });
}
