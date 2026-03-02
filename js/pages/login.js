// login.js — Login / first-time password setup page
const Login = {
  render(container) {
    const isSetup = !Auth.hasPassword();

    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">📊</div>
            <h1 class="login-title">${isSetup ? 'Set Up Access' : 'Private Access'}</h1>
            <p class="login-subtitle">${isSetup
              ? 'Create a password to protect your portfolio editing tools.'
              : 'Enter your password to access trading and editing features.'}</p>
          </div>

          <div id="login-error" class="login-error" style="display:none"></div>
          <div id="login-success" class="login-success" style="display:none"></div>

          <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">${isSetup ? 'Choose a Password' : 'Password'}</label>
            <div class="login-input-wrap">
              <input type="password" class="form-control" id="login-pw" placeholder="${isSetup ? 'Enter a strong password' : 'Enter your password'}" autofocus
                onkeydown="if(event.key==='Enter') Login.submit()">
              <button type="button" class="login-eye" onclick="Login.togglePw()" title="Show/hide password">👁</button>
            </div>
          </div>

          ${isSetup ? `
          <div class="form-group" style="margin-bottom:20px">
            <label class="form-label">Confirm Password</label>
            <div class="login-input-wrap">
              <input type="password" class="form-control" id="login-pw2" placeholder="Re-enter password"
                onkeydown="if(event.key==='Enter') Login.submit()">
            </div>
          </div>
          ` : ''}

          <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px" onclick="Login.submit()">
            ${isSetup ? 'Set Password & Sign In' : 'Sign In'}
          </button>

          ${!isSetup ? `
          <p style="text-align:center;margin-top:16px;font-size:0.75rem;color:var(--text-dim)">
            Forgot password? Clear <code>vip_auth_hash</code> from localStorage in DevTools.
          </p>
          ` : ''}

          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <p style="font-size:0.78rem;color:var(--text-dim)">
              Public pages (Dashboard, Analytics, Public View) are accessible without login.
            </p>
            <a href="#dashboard" style="font-size:0.82rem;color:var(--primary-light)">View public portfolio →</a>
          </div>
        </div>
      </div>
    `;

    // Focus password field
    setTimeout(() => document.getElementById('login-pw')?.focus(), 100);
  },

  togglePw() {
    const el = document.getElementById('login-pw');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
    const el2 = document.getElementById('login-pw2');
    if (el2) el2.type = el2.type === 'password' ? 'text' : 'password';
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
    const pw = document.getElementById('login-pw')?.value || '';
    const isSetup = !Auth.hasPassword();

    if (!pw) {
      this.showError('Please enter a password.');
      return;
    }

    if (isSetup) {
      // Setup mode
      if (pw.length < 6) {
        this.showError('Password must be at least 6 characters.');
        return;
      }
      const pw2 = document.getElementById('login-pw2')?.value || '';
      if (pw !== pw2) {
        this.showError('Passwords do not match.');
        return;
      }
      await Auth.setPassword(pw);
      this.showSuccess('Password set! Signing you in...');
      setTimeout(() => {
        window.location.hash = Auth.getRedirect();
      }, 800);
    } else {
      // Login mode
      const ok = await Auth.login(pw);
      if (ok) {
        this.showSuccess('Welcome back!');
        setTimeout(() => {
          window.location.hash = Auth.getRedirect();
        }, 500);
      } else {
        this.showError('Incorrect password.');
        document.getElementById('login-pw').value = '';
        document.getElementById('login-pw')?.focus();
      }
    }
  }
};

window.Login = Login;
