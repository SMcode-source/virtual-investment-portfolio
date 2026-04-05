/**
 * Cloudflare Pages Function — /api/history-protection
 *
 * GET: Public read — returns current history protection settings
 * POST: Authenticated write — updates history protection settings
 *
 * Settings:
 *   - enabled: boolean — whether to validate before overwriting history
 *   - minBarThreshold: number (0-1) — reject if new/existing ratio is below this
 *   - keepBackup: boolean — keep last-known-good backup before overwriting
 *
 * Also supports:
 *   POST with { action: 'restore', ticker: 'SPY' } — restore a ticker from backup
 *   POST with { action: 'list-backups' } — list available backup tickers
 */

import { isAuthorized, jsonResponse, errorResponse, handleOptions } from './_helpers.js';

const DEFAULT_SETTINGS = {
  enabled: true,
  minBarThreshold: 0.8,
  keepBackup: true
};

export async function onRequestGet(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  try {
    const settings = await kv.get('_historyProtection', 'json') || DEFAULT_SETTINGS;
    return jsonResponse(settings);
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  if (!isAuthorized(context.request, context.env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await context.request.json();

    // Action: restore a ticker's history from backup
    if (body.action === 'restore' && body.ticker) {
      const backupKey = `_backup_history_${body.ticker}`;
      const backup = await kv.get(backupKey, 'json');
      if (!backup || !backup.data) {
        return jsonResponse({ ok: false, reason: `No backup found for ${body.ticker}` });
      }
      // Restore the backup as the current history
      await kv.put(`history_${body.ticker}`, JSON.stringify(backup));
      return jsonResponse({
        ok: true,
        restored: body.ticker,
        bars: backup.data.length,
        backupTs: backup.ts
      });
    }

    // Action: list available backups
    if (body.action === 'list-backups') {
      const list = await kv.list({ prefix: '_backup_history_' });
      const backups = [];
      for (const key of list.keys) {
        const ticker = key.name.replace('_backup_history_', '');
        const data = await kv.get(key.name, 'json');
        backups.push({
          ticker,
          bars: data?.data?.length || 0,
          ts: data?.ts || null,
          date: data?.ts ? new Date(data.ts).toISOString() : null
        });
      }
      return jsonResponse({ ok: true, backups });
    }

    // Default: update protection settings
    const settings = {
      enabled: body.enabled !== undefined ? !!body.enabled : DEFAULT_SETTINGS.enabled,
      minBarThreshold: typeof body.minBarThreshold === 'number'
        ? Math.max(0, Math.min(1, body.minBarThreshold))
        : DEFAULT_SETTINGS.minBarThreshold,
      keepBackup: body.keepBackup !== undefined ? !!body.keepBackup : DEFAULT_SETTINGS.keepBackup
    };

    await kv.put('_historyProtection', JSON.stringify(settings));
    return jsonResponse({ ok: true, settings });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
