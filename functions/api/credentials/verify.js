/**
 * Cloudflare Pages Function — /api/credentials/verify
 *
 * POST: Verifies if provided username and password hashes match stored credentials
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *
 * Authentication: None required (this endpoint IS the authentication check)
 *
 * Request body:
 *   - userHash: SHA-256 hash of username
 *   - passHash: SHA-256 hash of password
 *
 * Response: { valid: boolean, reason?: string }
 *   When valid=false, reason explains why (e.g., 'no_cloud_credentials')
 *
 * Usage:
 *   POST /api/credentials/verify with { userHash: "...", passHash: "..." }
 */

import { jsonResponse, errorResponse, handleOptions } from '../_helpers.js';

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  if (!kv) return errorResponse('KV not configured', 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { userHash, passHash } = body;
  if (!userHash || !passHash) {
    return errorResponse('Missing userHash or passHash', 400);
  }

  try {
    const creds = await kv.get('_credentials', 'json');
    if (!creds || !creds.userHash || !creds.passHash) {
      // No cloud credentials stored — return false (fallback to hardcoded)
      return jsonResponse({ valid: false, reason: 'no_cloud_credentials' });
    }

    const valid = (userHash === creds.userHash && passHash === creds.passHash);
    return jsonResponse({ valid });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
