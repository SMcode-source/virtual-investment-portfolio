/**
 * Cloudflare Pages Function — /api/reset/verify
 *
 * POST: Verifies that a password reset token is valid and not yet used
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *
 * Authentication: None required
 *
 * Request body:
 *   - token: Reset token from password reset email
 *
 * Response: { valid: boolean, username?: string, createdAt?: string, reason?: string }
 *
 * Validation checks:
 *   - Token must exist in KV (not expired)
 *   - Token must match the stored token
 *   - Token must not have been used already
 *
 * Usage:
 *   POST /api/reset/verify with { token: "..." }
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

  const { token } = body;
  if (!token) {
    return errorResponse('Token required', 400);
  }

  try {
    const tokenData = await kv.get('_resetToken', 'json');

    if (!tokenData) {
      return jsonResponse({ valid: false, reason: 'Token expired or not found' });
    }

    if (tokenData.token !== token) {
      return jsonResponse({ valid: false, reason: 'Invalid token' });
    }

    if (tokenData.used) {
      return jsonResponse({ valid: false, reason: 'Token already used' });
    }

    // Get current username for display
    const creds = await kv.get('_credentials', 'json');
    const username = creds?.username || null;

    return jsonResponse({
      valid: true,
      username: username,
      createdAt: tokenData.createdAt
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
