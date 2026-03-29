/**
 * Cloudflare Pages Function — /api/yahoo
 *
 * GET: Proxy to Yahoo Finance API with domain allowlist and caching
 *
 * Environment variables: None required
 * Authentication: None required (public endpoint)
 *
 * Query parameters:
 *   - url: Full URL to Yahoo Finance API endpoint (must be on allowlisted domains)
 *
 * Security:
 *   - Only query1.finance.yahoo.com and query2.finance.yahoo.com are allowed
 *   - Invalid URLs are rejected
 *   - Responses are cached for 60 seconds
 *
 * Usage:
 *   GET /api/yahoo?url=https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d
 */

import { corsHeaders, jsonResponse, errorResponse, handleOptions } from './_helpers.js';

const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];

export async function onRequest(context) {
  const { request } = context;

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return errorResponse('Missing ?url= parameter', 400);
  }

  // Security: only allow Yahoo Finance domains
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return errorResponse('Invalid URL', 400);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return errorResponse(`Domain not allowed: ${parsed.hostname}`, 403);
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
        ...corsHeaders,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (e) {
    return errorResponse(`Fetch failed: ${e.message}`, 502);
  }
}
