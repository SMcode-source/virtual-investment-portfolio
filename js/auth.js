// auth.js — Fixed-credential authentication + cloud sync token
// Credentials can only be changed by updating this file and redeploying.
// To reset, email: saptarshimanna95@gmail.com
const Auth = {
  SESSION_KEY: 'vip_auth_session',
  SESSION_HOURS: 12,
  RESET_EMAIL: 'saptarshimanna95@gmail.com',

  // Hardcoded SHA-256 hashes — change these to update credentials
  // To generate a new hash: echo -n "yourvalue" | sha256sum
  VALID_USER_HASH: '12f80649f4412ed383a6334390dc4b3798924f9326e150503247c7419f2e37a0', // username
  VALID_PASS_HASH: 'b8735a1c3beccd9301ce4f688c94cdcb64658b1a00805ad7329011051fe579fd', // password

  _redirectAfterLogin: null,

  // --- SHA-256 Hashing (Web Crypto API) ---
  async hash(value) {
    const data = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // --- Verify credentials against hardcoded hashes ---
  async verify(username, password) {
    const userHash = await this.hash(username);
    const passHash = await this.hash(password);
    return userHash === this.VALID_USER_HASH && passHash === this.VALID_PASS_HASH;
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

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
    if (typeof CloudSync !== 'undefined') {
      CloudSync.signOut();
    }
  },

  // --- Redirect tracking ---
  setRedirect(page) {
    this._redirectAfterLogin = page;
  },

  getRedirect() {
    const page = this._redirectAfterLogin;
    this._redirectAfterLogin = null;
    return page || 'dashboard';
  }
};

window.Auth = Auth;
