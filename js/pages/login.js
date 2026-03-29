/**
 * ============================================================================
 * LOGIN.JS — User Login Page
 * ============================================================================
 *
 * PURPOSE:
 *   Simple login form with username and password. Credentials are verified
 *   against SHA-256 hashes stored in Cloudflare KV (never stored in
 *   plaintext). Successful login enables cloud sync and access to
 *   protected pages (Log Trade, Journal, Settings, etc.).
 *
 * ============================================================================
 */
const Login = {
  render(container) {
    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">📊</div>
            <h1 class="login-title">Private Access</h1>
            <p class="login-subtitle">Enter your credentials to access trading and editing features. Logging in also enables cloud sync.</p>
          </div>

          <div id="login-error" class="login-error" style="display:none"></div>
          <div id="login-success" class="login-success" style="display:none"></div>

          <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Username</label>
            <div class="login-input-wrap">
              <input type="text" class="form-control" id="login-user" placeholder="Enter your username" autofocus
                onkeydown="if(event.key==='Enter') document.getElementById('login-pw').focus()">
            </div>
          </div>

          <div class="form-group" style="margin-bottom:20px">
            <label class="form-label">Password</label>
            <div class="login-input-wrap">
              <input type="password" class="form-control" id="login-pw" placeholder="Enter your password"
                onkeydown="if(event.key==='Enter') Login.submit()">
              <button type="button" class="login-eye" onclick="Login.togglePw()" title="Show/hide password">👁</button>
            </div>
          </div>

          <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px" onclick="Login.submit()">
            Sign In
          </button>

          <div style="text-align:center;margin-top:16px">
            <a href="#forgotPassword" style="font-size:0.82rem;color:var(--primary-light)">Forgot your password?</a>
          </div>

          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <p style="font-size:0.78rem;color:var(--text-dim)">
              Public pages (Dashboard, Analytics, Public View) are accessible without login.
            </p>
            <a href="#dashboard" style="font-size:0.82rem;color:var(--primary-light)">View public portfolio →</a>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => document.getElementById('login-user')?.focus(), 100);
  },

  togglePw() {
    const el = document.getElementById('login-pw');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  },

  showError(msg) {
    const el = document.getElementById('login-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const ok = document.getElementById('login-success');
    if (ok) ok.style.display = 'none';
  },

  showSuccess(msg) {
    const el = document.getElementById('login-success');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const err = document.getElementById('login-error');
    if (err) err.style.display = 'none';
  },

  async submit() {
    const user = document.getElementById('login-user')?.value || '';
    const pw = document.getElementById('login-pw')?.value || '';

    if (!user || !pw) {
      this.showError('Please enter both username and password.');
      return;
    }

    const ok = await Auth.login(user, pw);
    if (ok) {
      this.showSuccess('Welcome back! Cloud sync enabled.');
      setTimeout(() => {
        window.location.hash = Auth.getRedirect();
      }, 500);
    } else {
      this.showError('Invalid username or password.');
      document.getElementById('login-pw').value = '';
      document.getElementById('login-pw')?.focus();
    }
  }
};

window.Login = Login;
