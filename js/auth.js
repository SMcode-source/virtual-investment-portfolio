/**
 * ============================================================================
 * AUTH.JS — User Authentication & Session Management
 * ============================================================================
 *
 * PURPOSE:
 *   Handles user login/logout, password verification, and session management.
 *   Credentials are stored as SHA-256 hashes in Cloudflare KV. Falls back to
 *   hardcoded hashes if no cloud credentials are set. Users can change their
 *   credentials from the Settings page.
 *
 * HOW IT WORKS:
 *   1. Credentials stored as SHA-256 hashes (passwords never sent plaintext)
 *   2. Fallback hashes compiled into the app (always work, even offline)
 *   3. Cloud credentials checked via /api/credentials/verify endpoint
 *   4. Session created in sessionStorage (expires after 12 hours or page close)
 *   5. Sync token = password hash (used to authorize cloud writes via CloudSync)
 *
 * KEY ENDPOINTS:
 *   GET  /api/credentials              — Check if custom credentials are set
 *   POST /api/credentials/verify       — Verify username/password hashes
 *   POST /api/credentials              — Update credentials (authenticated)
 *
 * ============================================================================
 */

const Auth = {
  /**
   * Fallback SHA-256 hashes — used when no cloud credentials are stored.
   * These are the original credentials compiled into the app.
   * Using Config for the source of truth.
   * @private
   */
  _fallbackUserHash: Config.AUTH.FALLBACK_USER_HASH,
  _fallbackPassHash: Config.AUTH.FALLBACK_PASS_HASH,

  // In-memory copies that get updated when user changes credentials
  VALID_USER_HASH: Config.AUTH.FALLBACK_USER_HASH,
  VALID_PASS_HASH: Config.AUTH.FALLBACK_PASS_HASH,

  // Cloud credentials (loaded at init from /api/credentials or KV)
  _cloudCreds: null,
  _cloudCredsLoaded: false,

  _redirectAfterLogin: null,

  // ── Cryptography ──────────────────────────────────────────────────────────

  /**
   * Hash a string using SHA-256 (Web Crypto API).
   * Used to hash username and password before comparing or sending to cloud.
   * @param {string} value - The string to hash
   * @returns {Promise<string>} The hexadecimal SHA-256 hash
   */
  async hash(value) {
    const data = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // ── Cloud credential loading ──────────────────────────────────────────────

  /**
   * Load cloud credentials metadata (called once at app init).
   * Checks if custom credentials have been set in Cloudflare KV.
   * Does not fetch the actual hashes (they're checked server-side for security).
   * @private
   */
  async loadCloudCredentials() {
    if (this._cloudCredsLoaded) return;
    try {
      const resp = await fetch('/api/credentials');
      if (resp.ok) {
        const data = await resp.json();
        if (data.hasCustomCredentials) {
          // We know custom creds exist, but we don't have the hashes client-side
          // The actual verification happens by checking both hardcoded AND cloud hashes
          this._cloudCreds = data;
        }
      }
    } catch (e) {
      console.warn('[Auth] Could not load cloud credentials:', e.message);
    }
    this._cloudCredsLoaded = true;
  },

  // ── Verification ──────────────────────────────────────────────────────────

  /**
   * Verify username and password against known hashes.
   * Tries hardcoded hashes first (fast, offline), then cloud hashes if available.
   * @param {string} username - The username
   * @param {string} password - The password
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async verify(username, password) {
    const userHash = await this.hash(username);
    const passHash = await this.hash(password);

    // First: check hardcoded hashes (always works, even offline)
    if (userHash === this.VALID_USER_HASH && passHash === this.VALID_PASS_HASH) {
      return true;
    }

    // Second: check cloud-stored credentials if available
    try {
      const resp = await fetch('/api/credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userHash, passHash })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.valid) return true;
      }
    } catch (e) {
      console.warn('[Auth] Cloud credential check failed:', e.message);
    }

    return false;
  },

  // ── Session Management ────────────────────────────────────────────────────

  /**
   * Create a new session in sessionStorage.
   * Session expires after Config.AUTH.SESSION_DURATION_HOURS.
   * @private
   */
  _createSession() {
    const expiry = Date.now() + (Config.AUTH.SESSION_DURATION_HOURS * 60 * 60 * 1000);
    sessionStorage.setItem(Config.APP.SESSION_KEY, JSON.stringify({ expiry }));
  },

  /**
   * Check if the user has a valid, non-expired session.
   * @returns {boolean} True if logged in
   */
  isAuthenticated() {
    try {
      const session = JSON.parse(sessionStorage.getItem(Config.APP.SESSION_KEY));
      if (session && session.expiry > Date.now()) return true;
      sessionStorage.removeItem(Config.APP.SESSION_KEY);
      return false;
    } catch {
      return false;
    }
  },

  // ── Login / Logout ────────────────────────────────────────────────────────

  /**
   * Attempt to log in with username and password.
   * Creates a session and sets the sync token for cloud writes.
   * @param {string} username - The username
   * @param {string} password - The password
   * @returns {Promise<boolean>} True if login successful
   */
  async login(username, password) {
    if (await this.verify(username, password)) {
      this._createSession();
      // Set sync token = password hash so cloud writes are authorized
      const passHash = await this.hash(password);
      if (typeof CloudSync !== 'undefined') {
        CloudSync.setSyncToken(passHash);
      }
      return true;
    }
    return false;
  },

  /**
   * Log out the user. Clears session and sync token.
   */
  logout() {
    sessionStorage.removeItem(Config.APP.SESSION_KEY);
    if (typeof CloudSync !== 'undefined') {
      CloudSync.signOut();
    }
  },

  // ── Credential Management ─────────────────────────────────────────────────

  /**
   * Change the user's credentials (must be logged in).
   * Updates both the in-memory copies and Cloudflare KV.
   * @param {string} newUsername - The new username
   * @param {string} newPassword - The new password
   * @returns {Promise<Object>} {newPassHash} for updating sync token
   * @throws {Error} If not authenticated or server request fails
   */
  async changeCredentials(newUsername, newPassword) {
    const newUserHash = await this.hash(newUsername);
    const newPassHash = await this.hash(newPassword);
    const token = CloudSync.getSyncToken();

    if (!token) throw new Error('Not authenticated — log in first');

    const resp = await fetch('/api/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newUserHash, newPassHash })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Failed: HTTP ${resp.status}`);
    }

    // Update the in-memory hashes so they work immediately
    this.VALID_USER_HASH = newUserHash;
    this.VALID_PASS_HASH = newPassHash;

    // Update sync token to the new password hash
    CloudSync.setSyncToken(newPassHash);

    return { newPassHash };
  },

  // ── Navigation redirect tracking ──────────────────────────────────────────

  /**
   * Remember which page the user was trying to access before login.
   * Used to redirect them after successful login.
   * @param {string} page - The page hash (e.g., 'journal', 'settings')
   */
  setRedirect(page) {
    this._redirectAfterLogin = page;
  },

  /**
   * Get and clear the stored redirect page.
   * Returns 'dashboard' if no redirect was set.
   * @returns {string} The page to navigate to
   */
  getRedirect() {
    const page = this._redirectAfterLogin;
    this._redirectAfterLogin = null;
    return page || 'dashboard';
  }
};

window.Auth = Auth;
