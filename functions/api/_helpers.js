/**
 * Shared helpers for all Cloudflare Pages Functions.
 * Import with: import { isAuthorized, jsonResponse, errorResponse, corsHeaders, handleOptions, ALLOWED_KEYS } from './_helpers.js';
 *
 * These utilities reduce code duplication across functions and provide consistent:
 * - Authentication checking via Bearer token
 * - JSON response formatting with CORS headers
 * - CORS preflight handling
 * - Data key allowlisting
 */

/**
 * Standard CORS headers (allow any origin for this public API)
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Allowed data keys that can be read/written via /api/data endpoints.
 * Used to whitelist which keys are accessible to prevent accidental exposure.
 */
export const ALLOWED_KEYS = [
  'trades',
  'journal',
  'thinkPieces',
  'watchlist',
  'snapshots',
  'settings',
  'priceStore',
  'priceCache'
];

/**
 * Check if a request has a valid Bearer token matching SYNC_SECRET.
 * Used to protect write operations (POST requests).
 *
 * @param {Request} request - The HTTP request object
 * @param {Object} env - Environment object containing SYNC_SECRET
 * @returns {boolean} true if Authorization header contains valid Bearer token
 */
export function isAuthorized(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  return !!(token && token === env.SYNC_SECRET);
}

/**
 * Return a JSON success response with CORS headers.
 *
 * @param {any} data - Data to serialize to JSON
 * @param {number} status - HTTP status code (default: 200)
 * @returns {Response} Response object with JSON body and CORS headers
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Return a JSON error response with CORS headers.
 * Automatically wraps message in { error: message } object.
 *
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 400)
 * @returns {Response} Response object with JSON error body and CORS headers
 */
export function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Handle HTTP OPTIONS preflight requests for CORS.
 * Returns 204 No Content with appropriate CORS headers.
 *
 * @returns {Response} Empty response with CORS headers
 */
export function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Default history protection settings.
 * Used as fallback when KV has no stored settings yet.
 */
export const HISTORY_PROTECTION_DEFAULTS = {
  enabled: true,
  minBarThreshold: 0.8,
  keepBackup: true
};
