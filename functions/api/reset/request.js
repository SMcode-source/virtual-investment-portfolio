/**
 * Cloudflare Pages Function — /api/reset/request
 *
 * POST: Initiates password reset by sending a one-time token via email
 *
 * Environment variables:
 *   - PORTFOLIO_DATA: KV namespace binding for persistent storage
 *   - RESEND_API_KEY: API key for Resend email service
 *   - RESET_EMAIL: Email address authorized to receive password reset links
 *
 * Authentication: None required
 *
 * Request body:
 *   - email: Email address requesting password reset
 *
 * Implementation details:
 *   - Only sends email if provided email matches RESET_EMAIL
 *   - Rate limited to one request per 2 minutes
 *   - Token stored in KV with 15-minute TTL
 *   - Response always says email was sent (for security, never reveal if email is registered)
 *   - Token is 64-character hex string (256 bits of randomness)
 *
 * Usage:
 *   POST /api/reset/request with { email: "user@example.com" }
 */

import { jsonResponse, errorResponse, handleOptions } from '../_helpers.js';

export async function onRequestPost(context) {
  const kv = context.env.PORTFOLIO_DATA;
  const resendKey = context.env.RESEND_API_KEY;
  const resetEmail = context.env.RESET_EMAIL;

  if (!kv) return errorResponse('KV not configured', 500);
  if (!resendKey) return errorResponse('Email service not configured', 500);
  if (!resetEmail) return errorResponse('Reset email not configured', 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { email } = body;
  if (!email) {
    return errorResponse('Email address required', 400);
  }

  // Only allow reset if email matches the configured reset email
  if (email.toLowerCase().trim() !== resetEmail.toLowerCase().trim()) {
    // Don't reveal whether the email is valid — always return success
    return jsonResponse({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  }

  // Rate limit: only allow one reset request per 2 minutes
  const lastRequest = await kv.get('_resetLastRequest', 'json');
  if (lastRequest && (Date.now() - lastRequest.ts) < 120000) {
    return errorResponse('Please wait 2 minutes between reset requests', 429);
  }

  // Generate a secure random token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Store token in KV with 15-minute TTL
  const tokenData = {
    token,
    email: resetEmail,
    createdAt: new Date().toISOString(),
    used: false
  };
  await kv.put('_resetToken', JSON.stringify(tokenData), {
    expirationTtl: 900 // 15 minutes
  });

  // Record last request time (rate limiting)
  await kv.put('_resetLastRequest', JSON.stringify({ ts: Date.now() }));

  // Build reset URL
  const origin = new URL(context.request.url).origin;
  const resetUrl = `${origin}/#resetPassword?token=${token}`;

  // Get current username for display in email
  const creds = await kv.get('_credentials', 'json');
  const usernameHint = creds?.username || '(set in auth.js)';

  // Send email via Resend
  try {
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Virtual Investment Portfolio <onboarding@resend.dev>',
        to: [resetEmail],
        subject: 'Password Reset — Virtual Investment Portfolio',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset Request</h2>
            <p style="color: #555; font-size: 14px;">A password reset was requested for your Virtual Investment Portfolio account.</p>

            <div style="background: #f5f5ff; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; color: #666;">Your username:</p>
              <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #1a1a2e;">${usernameHint}</p>
            </div>

            <a href="${resetUrl}" style="display: inline-block; background: #6c63ff; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 12px 0;">
              Reset My Password
            </a>

            <p style="color: #888; font-size: 12px; margin-top: 24px;">
              This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
            </p>
            <p style="color: #aaa; font-size: 11px; margin-top: 16px; border-top: 1px solid #eee; padding-top: 12px;">
              Virtual Investment Portfolio &mdash; Hosted on Cloudflare Pages
            </p>
          </div>
        `
      })
    });

    if (!emailResp.ok) {
      const errData = await emailResp.json().catch(() => ({}));
      console.error('[reset] Resend API error:', JSON.stringify(errData));
      return errorResponse('Failed to send reset email. Please try again.', 502);
    }

    return jsonResponse({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (e) {
    console.error('[reset] Email send failed:', e.message);
    return errorResponse('Email service error', 502);
  }
}

export async function onRequestOptions(context) {
  return handleOptions();
}
