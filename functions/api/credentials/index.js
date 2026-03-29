/**
 * Cloudflare Pages Function — /api/credentials
 *
 * GET: Public — returns whether custom credentials are set (no sensitive data exposed)
 * POST: Authenticated — updates username hash and password hash
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *   - SYNC_SECRET: Bearer token required for POST requests
 *
 * Authentication: POST requires "Authorization: Bearer {SYNC_SECRET}" header
 *
 * Implementation details:
 *   - Credentials are stored in KV under key '_credentials'
 *   - Hashes must be 64-character hex strings (SHA-256 format)
 *   - After updating credentials, SYNC_SECRET env var must be updated to match the new password hash
 *
 * Usage:
 *   GET /api/credentials
 *   POST /api/credentials with { newUserHash: "...", newPassHash: "..." }
 */

import { isAuthorized, jsonResponse, errorResponse, handleOptions } from '../_helpers.js';

export async function onRequestGet(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  try {
    const creds = await kv.get('_credentials', 'json');
    return jsonResponse({
      hasCustomCredentials: !!(creds && creds.userHash && creds.passHash),
      updatedAt: creds?.updatedAt || null
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  // Must be authenticated with current credentials
  if (!isAuthorized(context.request, context.env)) {
    return errorResponse('Unauthorized — log in first', 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { newUserHash, newPassHash } = body;
  if (!newUserHash || !newPassHash) {
    return errorResponse('Missing newUserHash or newPassHash', 400);
  }

  // Validate hashes look like SHA-256 (64 hex chars)
  const hexPattern = /^[a-f0-9]{64}$/;
  if (!hexPattern.test(newUserHash) || !hexPattern.test(newPassHash)) {
    return errorResponse('Invalid hash format — must be 64 hex characters', 400);
  }

  try {
    // Store new credentials in KV
    await kv.put('_credentials', JSON.stringify({
      userHash: newUserHash,
      passHash: newPassHash,
      updatedAt: new Date().toISOString()
    }));

    return jsonResponse({
      ok: true,
      message: 'Credentials updated. You will need to update SYNC_SECRET in Cloudflare to match the new password hash for cloud sync to work.',
      newPassHash: newPassHash
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
