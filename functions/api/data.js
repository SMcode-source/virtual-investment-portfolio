/**
 * Cloudflare Pages Function — /api/data
 *
 * GET: Public read — returns all portfolio data as JSON object
 * POST: Authenticated write — saves all portfolio data from JSON object
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *   - SYNC_SECRET: Bearer token required for POST requests
 *
 * Authentication: POST requires "Authorization: Bearer {SYNC_SECRET}" header
 *
 * Usage:
 *   GET /api/data
 *   POST /api/data with body { trades: [...], journal: [...], ... }
 */

import { isAuthorized, jsonResponse, errorResponse, ALLOWED_KEYS, handleOptions } from './_helpers.js';

export async function onRequestGet(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  const data = {};
  for (const key of ALLOWED_KEYS) {
    try {
      const val = await kv.get(key, 'json');
      if (val !== null) data[key] = val;
    } catch (e) {
      console.error(`[data] Failed to read ${key}:`, e.message);
    }
  }
  return jsonResponse(data);
}

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  if (!isAuthorized(context.request, context.env)) {
    return errorResponse('Unauthorized', 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  let written = 0;
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      try {
        await kv.put(key, JSON.stringify(body[key]));
        written++;
      } catch (e) {
        console.error(`[data] Failed to write ${key}:`, e.message);
      }
    }
  }

  return jsonResponse({ ok: true, keysWritten: written });
}

export async function onRequestOptions(context) {
  return handleOptions();
}
