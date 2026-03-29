/**
 * ============================================================================
 * RESETPASSWORD.JS — Complete Password Reset (Token Verification)
 * ============================================================================
 *
 * PURPOSE:
 *   Handles the password reset flow after a user clicks the emailed link.
 *   Verifies the one-time token, then lets the user set a new username
 *   and password. Credentials are hashed client-side before being sent
 *   to the server.
 *
 * ============================================================================
 */
const ResetPassword = {
  _token: null,
  _username: null,

  render(container) {
    // Extract token from hash: #resetPassword?token=abc123
    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] || '');
    this._token = params.get('token');

    if (!this._token) {
      container.innerHTML = `
        <div class="login-overlay">
          <div class="login-card">
            <div class="login-header">
              <div class="login-icon">⚠️</div>
              <h1 class="login-title">Invalid Reset Link</h1>
              <p class="login-subtitle">This reset link is missing or malformed. Please request a new one.</p>
            </div>
            <a href="#forgotPassword" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;text-decoration:none;margin-top:16px">
              Request New Reset Link
            </a>
            <div style="text-align:center;margin-top:16px">
              <a href="#login" style="font-size:0.82rem;color:var(--primary-light)">← Back to login</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Show loading while verifying token
    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">⏳</div>
            <h1 class="login-title">Verifying Reset Link...</h1>
            <p class="login-subtitle">Please wait while we verify your reset token.</p>
          </div>
        </div>
      </div>
    `;

    this._verifyAndRender(container);
  },

  async _verifyAndRender(container) {
    try {
      const resp = await fetch('/api/reset/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this._token })
      });

      const data = await resp.json();

      if (!data.valid) {
        container.innerHTML = `
          <div class="login-overlay">
            <div class="login-card">
              <div class="login-header">
                <div class="login-icon">❌</div>
                <h1 class="login-title">Link Expired</h1>
                <p class="login-subtitle">${data.reason || 'This reset link has expired or is invalid.'} Please request a new one.</p>
              </div>
              <a href="#forgotPassword" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;text-decoration:none;margin-top:16px">
                Request New Reset Link
              </a>
              <div style="text-align:center;margin-top:16px">
                <a href="#login" style="font-size:0.82rem;color:var(--primary-light)">← Back to login</a>
              </div>
            </div>
          </div>
        `;
        return;
      }

      this._username = data.username;
      this._renderForm(container);
    } catch (e) {
      container.innerHTML = `
        <div class="login-overlay">
          <div class="login-card">
            <div class="login-header">
              <div class="login-icon">⚠️</div>
              <h1 class="login-title">Network Error</h1>
              <p class="login-subtitle">Could not verify the reset link. Please check your connection and try again.</p>
            </div>
          </div>
        </div>
      `;
    }
  },

  _renderForm(container) {
    const usernameDisplay = this._username
      ? `<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:20px">
           <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:4px">Your current username:</div>
           <div style="font-size:1rem;font-weight:600;color:var(--text)">${this._username}</div>
         </div>`
      : '';

    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">🔑</div>
            <h1 class="login-title">Set New Password</h1>
            <p class="login-subtitle">Enter your new credentials below.</p>
          </div>

          ${usernameDisplay}

          <div id="rp-error" class="login-error" style="display:none"></div>
          <div id="rp-success" class="login-success" style="display:none"></div>

          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">New Username</label>
            <div class="login-input-wrap">
              <input type="text" class="form-control" id="rp-user" placeholder="Enter username" value="${this._username || ''}" autofocus>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">New Password</label>
            <div class="login-input-wrap">
              <input type="password" class="form-control" id="rp-pass" placeholder="Enter new password"
                onkeydown="if(event.key==='Enter') document.getElementById('rp-confirm').focus()">
              <button type="button" class="login-eye" onclick="ResetPassword.togglePw('rp-pass')" title="Show/hide">👁</button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:20px">
            <label class="form-label">Confirm Password</label>
            <div class="login-input-wrap">
              <input type="password" class="form-control" id="rp-confirm" placeholder="Confirm new password"
                onkeydown="if(event.key==='Enter') ResetPassword.submit()">
            </div>
          </div>

          <button class="btn btn-primary" id="rp-btn" style="width:100%;justify-content:center;padding:12px" onclick="ResetPassword.submit()">
            Reset Password
          </button>

          <div style="text-align:center;margin-top:16px">
            <a href="#login" style="font-size:0.82rem;color:var(--primary-light)">← Back to login</a>
          </div>
        </div>
      </div>
    `;
  },

  togglePw(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  },

  showError(msg) {
    const el = document.getElementById('rp-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const ok = document.getElementById('rp-success');
    if (ok) ok.style.display = 'none';
  },

  showSuccess(msg) {
    const el = document.getElementById('rp-success');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const err = document.getElementById('rp-error');
    if (err) err.style.display = 'none';
  },

  async submit() {
    const username = document.getElementById('rp-user')?.value?.trim();
    const password = document.getElementById('rp-pass')?.value;
    const confirm = document.getElementById('rp-confirm')?.value;
    const btn = document.getElementById('rp-btn');

    if (!username) { this.showError('Please enter a username.'); return; }
    if (!password) { this.showError('Please enter a new password.'); return; }
    if (password.length < 4) { this.showError('Password must be at least 4 characters.'); return; }
    if (password !== confirm) { this.showError('Passwords do not match.'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Resetting...'; }

    try {
      const newUserHash = await Auth.hash(username);
      const newPassHash = await Auth.hash(password);

      const resp = await fetch('/api/reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this._token,
          newUserHash,
          newPassHash,
          newUsername: username
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        this.showError(data.error || 'Reset failed. Please try again.');
        return;
      }

      this.showSuccess('Password reset successful! Redirecting to login...');

      // Update in-memory auth hashes
      Auth.VALID_USER_HASH = newUserHash;
      Auth.VALID_PASS_HASH = newPassHash;

      setTimeout(() => {
        window.location.hash = '#login';
      }, 2000);
    } catch (e) {
      this.showError('Network error: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reset Password'; }
    }
  }
};

window.ResetPassword = ResetPassword;
