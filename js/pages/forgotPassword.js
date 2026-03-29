/**
 * ============================================================================
 * FORGOTPASSWORD.JS — Password Reset Request Page
 * ============================================================================
 *
 * PURPOSE:
 *   Lets users request a password reset email. Sends a one-time reset link
 *   via the Resend email API (handled by the /api/reset/request function).
 *
 * ============================================================================
 */
const ForgotPassword = {
  render(container) {
    container.innerHTML = `
      <div class="login-overlay">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">🔐</div>
            <h1 class="login-title">Reset Password</h1>
            <p class="login-subtitle">Enter your email address and we'll send you a link to reset your password.</p>
          </div>

          <div id="reset-error" class="login-error" style="display:none"></div>
          <div id="reset-success" class="login-success" style="display:none"></div>

          <div class="form-group" style="margin-bottom:20px">
            <label class="form-label">Email Address</label>
            <div class="login-input-wrap">
              <input type="email" class="form-control" id="reset-email" placeholder="Enter your email address" autofocus
                onkeydown="if(event.key==='Enter') ForgotPassword.submit()">
            </div>
          </div>

          <button class="btn btn-primary" id="reset-btn" style="width:100%;justify-content:center;padding:12px" onclick="ForgotPassword.submit()">
            Send Reset Link
          </button>

          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <a href="#login" style="font-size:0.82rem;color:var(--primary-light)">← Back to login</a>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => document.getElementById('reset-email')?.focus(), 100);
  },

  showError(msg) {
    const el = document.getElementById('reset-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const ok = document.getElementById('reset-success');
    if (ok) ok.style.display = 'none';
  },

  showSuccess(msg) {
    const el = document.getElementById('reset-success');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    const err = document.getElementById('reset-error');
    if (err) err.style.display = 'none';
  },

  async submit() {
    const email = document.getElementById('reset-email')?.value?.trim();
    const btn = document.getElementById('reset-btn');

    if (!email) {
      this.showError('Please enter your email address.');
      return;
    }

    if (!email.includes('@')) {
      this.showError('Please enter a valid email address.');
      return;
    }

    // Disable button during request
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
      const resp = await fetch('/api/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await resp.json();

      if (resp.status === 429) {
        this.showError(data.error || 'Please wait before requesting another reset.');
      } else if (!resp.ok) {
        this.showError(data.error || 'Something went wrong. Please try again.');
      } else {
        this.showSuccess('If that email is registered, a reset link has been sent. Check your inbox (and spam folder).');
        if (document.getElementById('reset-email')) {
          document.getElementById('reset-email').value = '';
        }
      }
    } catch (e) {
      this.showError('Network error. Please check your connection and try again.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    }
  }
};

window.ForgotPassword = ForgotPassword;
