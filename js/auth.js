// auth.js — Simple password gate for protected pages
// Uses SHA-256 (Web Crypto API) + sessionStorage for session
const Auth = {
  SESSION_KEY: 'vip_auth_session',
  HASH_KEY: 'vip_auth_hash',
  SESSION_HOURS: 12,
  _redirectAfterLogin: null,

  // --- Password Hashing (SHA-256) ---
  async hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // --- Password Management ---
  hasPassword() {
    return !!localStorage.getItem(this.HASH_KEY);
  },

  async setPassword(password) {
    const hash = await this.hashPassword(password);
    localStorage.setItem(this.HASH_KEY, hash);
    this._createSession();
    return true;
  },

  async changePassword(currentPassword, newPassword) {
    if (!await this.verifyPassword(currentPassword)) {
      return false;
    }
    const hash = await this.hashPassword(newPassword);
    localStorage.setItem(this.HASH_KEY, hash);
    return true;
  },

  async verifyPassword(password) {
    const hash = await this.hashPassword(password);
    const stored = localStorage.getItem(this.HASH_KEY);
    return hash === stored;
  },

  // --- Session ---
  _createSession() {
    const expiry = Date.now() + (this.SESSION_HOURS * 60 * 60 * 1000);
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({ expiry }));
  },

  isAuthenticated() {
    try {
      const session = JSON.parse(sessionStorage.getItem(this.SESSION_KEY));
      if (session && session.expiry > Date.now()) return true;
      sessionStorage.removeItem(this.SESSION_KEY);
      return false;
    } catch {
      return false;
    }
  },

  // --- Login / Logout ---
  async login(password) {
    if (await this.verifyPassword(password)) {
      this._createSession();
      return true;
    }
    return false;
  },

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
  },

  // --- Redirect tracking ---
  setRedirect(page) {
    this._redirectAfterLogin = page;
  },

  getRedirect() {
    const page = this._redirectAfterLogin;
    this._redirectAfterLogin = null;
    return page || 'dashboard';
  },

  // --- Reset (for forgot password) ---
  resetPassword() {
    localStorage.removeItem(this.HASH_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
  }
};

window.Auth = Auth;
