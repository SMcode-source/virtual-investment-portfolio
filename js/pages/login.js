// login.js — Login page with username + password
const Login = {
  render(container) {
    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">📊</div>
            <h1 class="login-title">Private Access</h1>
            <p class="login-subtitle">Enter your credentials to access trading and editing features.</p>
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

          ${FirebaseApp.ready ? `
          <div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px">Enable cloud sync to access your data from any device:</p>
            <button class="btn" id="google-signin-btn" style="width:100%;justify-content:center;padding:10px;gap:8px" onclick="Login.googleSignIn()">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign in with Google for Cloud Sync
            </button>
            <div id="google-signin-status" style="margin-top:8px;font-size:0.75rem"></div>
          </div>
          ` : ''}

          <p style="text-align:center;margin-top:16px;font-size:0.75rem;color:var(--text-dim)">
            Forgot credentials? <a href="mailto:${Auth.RESET_EMAIL}?subject=VIP%20Password%20Reset%20Request&body=Please%20reset%20my%20Virtual%20Investment%20Portfolio%20credentials." style="color:var(--primary-light)">Request a reset via email</a>
          </p>

          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <p style="font-size:0.78rem;color:var(--text-dim)">
              Public pages (Dashboard, Analytics, Public View) are accessible without login.
            </p>
            <a href="#dashboard" style="font-size:0.82rem;color:var(--primary-light)">View public portfolio →</a>
          </div>
        </div>
      </div>
    `;

    // Focus username field
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

  async googleSignIn() {
    const statusEl = document.getElementById('google-signin-status');
    const btn = document.getElementById('google-signin-btn');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b">Signing in with Google...</span>';

    const result = await Auth.signInWithGoogle();
    if (result.ok) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e">Cloud sync enabled! Your data will sync across devices.</span>';
      // Update sync status in sidebar
      if (typeof App !== 'undefined') App.updateSyncStatus();
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">Google sign-in failed: ${result.error || 'Unknown error'}</span>`;
      if (btn) btn.disabled = false;
    }
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
      this.showSuccess('Welcome back!');
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
