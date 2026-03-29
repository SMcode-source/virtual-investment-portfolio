/**
 * Cloudflare Pages Function — /api/reset/complete
 *
 * POST: Completes password reset by validating token and saving new credentials
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *
 * Authentication: None required (token serves as auth)
 *
 * Request body:
 *   - token: Reset token (must be valid and unused)
 *   - newUserHash: SHA-256 hash of new username (64 hex characters)
 *   - newPassHash: SHA-256 hash of new password (64 hex characters)
 *   - newUsername: (optional) Plaintext username for display purposes
 *
 * Validation:
 *   - Token must be valid and not expired
 *   - Token must not have been used already
 *   - Hashes must be 64-character hex strings (SHA-256 format)
 *
 * After successful reset:
 *   - SYNC_SECRET in Cloudflare should be updated to match newPassHash
 *   - Token is marked as used to prevent replay attacks
 *
 * Usage:
 *   POST /api/reset/complete with {
 *     token: "...",
 *     newUserHash: "...",
 *     newPassHash: "...",
 *     newUsername: "..."
 *   }
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

  const { token, newUserHash, newPassHash, newUsername } = body;
  if (!token || !newUserHash || !newPassHash) {
    return errorResponse('Missing required fields: token, newUserHash, newPassHash', 400);
  }

  // Validate hashes look like SHA-256 (64 hex chars)
  const hexPattern = /^[a-f0-9]{64}$/;
  if (!hexPattern.test(newUserHash) || !hexPattern.test(newPassHash)) {
    return errorResponse('Invalid hash format', 400);
  }

  try {
    // Verify token
    const tokenData = await kv.get('_resetToken', 'json');

    if (!tokenData) {
      return errorResponse('Reset token expired. Please request a new one.', 400);
    }

    if (tokenData.token !== token) {
      return errorResponse('Invalid reset token', 400);
    }

    if (tokenData.used) {
      return errorResponse('This reset token has already been used', 400);
    }

    // Mark token as used
    tokenData.used = true;
    await kv.put('_resetToken', JSON.stringify(tokenData), {
      expirationTtl: 60 // Keep for 1 more minute then auto-delete
    });

    // Store new credentials in KV
    await kv.put('_credentials', JSON.stringify({
      userHash: newUserHash,
      passHash: newPassHash,
      username: newUsername || null, // Store plaintext username for display
      updatedAt: new Date().toISOString(),
      updatedVia: 'password_reset'
    }));

    return jsonResponse({
      ok: true,
      message: 'Password reset successful! You can now log in with your new credentials.',
      newPassHash: newPassHash,
      note: 'Update SYNC_SECRET in Cloudflare to this password hash for cloud sync to work.'
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
