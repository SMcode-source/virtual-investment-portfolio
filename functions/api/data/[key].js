/**
 * Cloudflare Pages Function — /api/data/:key
 *
 * GET: Public read — returns data for a single allowed key
 * POST: Authenticated write — saves data for a single allowed key
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *   - SYNC_SECRET: Bearer token required for POST requests
 *
 * Authentication: POST requires "Authorization: Bearer {SYNC_SECRET}" header
 *
 * URL parameters:
 *   - key: One of trades, journal, thinkPieces, watchlist, snapshots, settings, priceStore, priceCache
 *
 * Usage:
 *   GET /api/data/trades
 *   POST /api/data/trades with JSON body
 */

import { isAuthorized, jsonResponse, errorResponse, ALLOWED_KEYS, handleOptions } from '../_helpers.js';

export async function onRequestGet(context) {
  const key = context.params.key;
  if (!ALLOWED_KEYS.includes(key)) {
    return errorResponse('Invalid key', 400);
  }

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  try {
    const val = await kv.get(key, 'json');
    return jsonResponse(val !== null ? val : null);
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestPost(context) {
  const key = context.params.key;
  if (!ALLOWED_KEYS.includes(key)) {
    return errorResponse('Invalid key', 400);
  }

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  if (!isAuthorized(context.request, context.env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await context.request.json();
    await kv.put(key, JSON.stringify(body));
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
