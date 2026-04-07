/**
 * Cloudflare Pages Function — /api/history/:ticker
 *
 * GET: Public read — returns cached price history for a stock ticker
 * POST: Authenticated write — saves price history for a stock ticker
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *   - SYNC_SECRET: Bearer token required for POST requests
 *
 * Authentication: POST requires "Authorization: Bearer {SYNC_SECRET}" header
 *
 * URL parameters:
 *   - ticker: Stock ticker symbol (e.g., SPY, QQQ, AAPL)
 *
 * Implementation details:
 *   Data is stored in KV with keys prefixed "history_" (e.g., "history_SPY")
 *
 * Usage:
 *   GET /api/history/SPY
 *   POST /api/history/SPY with JSON body containing price data
 */

import { isAuthorized, jsonResponse, errorResponse, handleOptions, HISTORY_PROTECTION_DEFAULTS } from '../_helpers.js';

export async function onRequestGet(context) {
  const ticker = context.params.ticker;
  if (!ticker) return errorResponse('Missing ticker', 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  try {
    const val = await kv.get(`history_${ticker}`, 'json');
    return jsonResponse(val !== null ? val : null);
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestPost(context) {
  const ticker = context.params.ticker;
  if (!ticker) return errorResponse('Missing ticker', 400);

  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  if (!isAuthorized(context.request, context.env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await context.request.json();
    const newLen = body?.data?.length || 0;

    // ── History Protection: validate before overwriting ──
    const protection = await kv.get('_historyProtection', 'json') || HISTORY_PROTECTION_DEFAULTS;

    if (protection.enabled && newLen > 0) {
      const existing = await kv.get(`history_${ticker}`, 'json');
      const existingLen = existing?.data?.length || 0;

      if (existingLen > 0) {
        const ratio = newLen / existingLen;

        if (ratio < protection.minBarThreshold) {
          return jsonResponse({
            ok: false,
            protected: true,
            reason: `New data (${newLen} bars) is significantly smaller than existing (${existingLen} bars). Ratio ${ratio.toFixed(2)} < threshold ${protection.minBarThreshold}. Update rejected to protect data integrity.`
          });
        }

        // Keep backup before overwriting
        if (protection.keepBackup) {
          await kv.put(`_backup_history_${ticker}`, JSON.stringify(existing));
        }
      }
    }

    await kv.put(`history_${ticker}`, JSON.stringify(body));
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
