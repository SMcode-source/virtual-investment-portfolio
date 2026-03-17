// utils.js — Formatting helpers, computation utilities
const Utils = {
  // --- Formatting ---
  formatCurrency(val, currency = 'USD', compact = false) {
    if (val == null || isNaN(val)) return '$0.00';
    const opts = { style: 'currency', currency };
    if (compact && Math.abs(val) >= 1000) {
      opts.notation = 'compact';
      opts.maximumFractionDigits = 1;
    } else {
      opts.minimumFractionDigits = 2;
      opts.maximumFractionDigits = 2;
    }
    return new Intl.NumberFormat('en-US', opts).format(val);
  },

  formatPercent(val, digits = 2) {
    if (val == null || isNaN(val)) return '0.00%';
    return (val >= 0 ? '+' : '') + val.toFixed(digits) + '%';
  },

  formatNumber(val, digits = 0) {
    if (val == null || isNaN(val)) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val);
  },

  formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatDateTime(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  // --- Color helpers ---
  plColor(val) { return val >= 0 ? '#22c55e' : '#ef4444'; },
  plClass(val) { return val >= 0 ? 'positive' : 'negative'; },

  // --- Country flags ---
  countryFlags: {
    'USA': '🇺🇸', 'US': '🇺🇸', 'UK': '🇬🇧', 'GB': '🇬🇧', 'DE': '🇩🇪', 'Germany': '🇩🇪',
    'FR': '🇫🇷', 'France': '🇫🇷', 'JP': '🇯🇵', 'Japan': '🇯🇵', 'CN': '🇨🇳', 'China': '🇨🇳',
    'CA': '🇨🇦', 'Canada': '🇨🇦', 'AU': '🇦🇺', 'Australia': '🇦🇺', 'KR': '🇰🇷', 'Korea': '🇰🇷',
    'TW': '🇹🇼', 'Taiwan': '🇹🇼', 'IN': '🇮🇳', 'India': '🇮🇳', 'BR': '🇧🇷', 'Brazil': '🇧🇷',
    'HK': '🇭🇰', 'SG': '🇸🇬', 'NL': '🇳🇱', 'Netherlands': '🇳🇱', 'CH': '🇨🇭', 'Switzerland': '🇨🇭',
    'SE': '🇸🇪', 'Sweden': '🇸🇪', 'IE': '🇮🇪', 'Ireland': '🇮🇪', 'IL': '🇮🇱', 'Israel': '🇮🇱',
    'IT': '🇮🇹', 'Italy': '🇮🇹', 'ES': '🇪🇸', 'Spain': '🇪🇸', 'MX': '🇲🇽', 'Mexico': '🇲🇽',
    'TR': '🇹🇷', 'Turkey': '🇹🇷', 'SA': '🇸🇦', 'ZA': '🇿🇦'
  },
  getFlag(country) { return this.countryFlags[country] || '🌐'; },

  // --- Sharpe Ratio Calculation ---
  calcSharpeRatio(returns, riskFreeRate = 0.04) {
    if (!returns || returns.length < 2) return { sharpe: 0, annReturn: 0, annVol: 0, riskFreeRate, dataPoints: 0 };
    const n = returns.length;
    const dailyRf = riskFreeRate / 252;
    const excessReturns = returns.map(r => r - dailyRf);
    const mean = excessReturns.reduce((a, b) => a + b, 0) / n;
    const variance = excessReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    const annReturn = mean * 252;
    const annVol = stdDev * Math.sqrt(252);
    const sharpe = annVol > 0 ? annReturn / annVol : 0;
    return { sharpe: Math.round(sharpe * 100) / 100, annReturn: annReturn * 100, annVol: annVol * 100, riskFreeRate, dataPoints: n };
  },

  // Build a tooltip string showing the Sharpe calculation breakdown
  sharpeTooltip(r) {
    const rf = ((r.riskFreeRate || 0) * 100).toFixed(1);
    const excessRet = r.annReturn.toFixed(2);
    const vol = r.annVol.toFixed(2);
    const pts = r.dataPoints || 0;
    return `Sharpe = Ann. Excess Return ÷ Ann. Volatility\n= ${excessRet}% ÷ ${vol}%\n= ${r.sharpe.toFixed(2)}\n\nAnn. Excess Return: ${excessRet}%\nAnn. Volatility: ${vol}%\nRisk-Free Rate (Rf): ${rf}%\nData Points: ${pts} days`;
  },

  // Sharpe rating
  sharpeRating(val) {
    if (val >= 1.5) return { label: 'Excellent', color: '#15803d', bg: '#f0fdf4' };
    if (val >= 0.5) return { label: 'Good', color: '#1d4ed8', bg: '#eff6ff' };
    if (val >= 0) return { label: 'Fair', color: '#92400e', bg: '#fffbeb' };
    return { label: 'Poor', color: '#b91c1c', bg: '#fef2f2' };
  },

  // Render a Sharpe rating pill with hover tooltip showing calculation
  sharpePill(result, rating) {
    if (!rating) rating = this.sharpeRating(result.sharpe);
    const tip = this.sharpeTooltip(result).replace(/"/g, '&quot;');
    return `<span class="sharpe-tip" data-sharpe-tip="${tip}"><span class="rating-pill" style="background:${rating.bg};color:${rating.color}">${result.sharpe.toFixed(2)} ${rating.label}</span></span>`;
  },

  // Render just the Sharpe number with tooltip (no rating label)
  sharpeValue(result) {
    const tip = this.sharpeTooltip(result).replace(/"/g, '&quot;');
    return `<span class="sharpe-tip" data-sharpe-tip="${tip}" style="font-family:var(--font-mono);font-weight:600">${result.sharpe.toFixed(2)}</span>`;
  },

  // Daily returns from price series
  dailyReturns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  },

  // Cumulative return series (for chart)
  cumulativeReturns(prices) {
    if (!prices.length) return [];
    const base = prices[0];
    return prices.map(p => ((p - base) / base) * 100);
  },

  // Max drawdown
  maxDrawdown(prices) {
    let peak = prices[0] || 0;
    let maxDd = 0;
    for (const p of prices) {
      if (p > peak) peak = p;
      const dd = (peak - p) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd * 100;
  },

  // --- Date helpers ---
  dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  },

  startOfYear() {
    return `${new Date().getFullYear()}-01-01`;
  },

  periodToStartDate(period) {
    const now = new Date();
    switch (period) {
      case '1M': return new Date(now.setMonth(now.getMonth() - 1)).toISOString().split('T')[0];
      case '3M': return new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
      case '6M': return new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
      case 'YTD': return this.startOfYear();
      case '1Y': return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
      case '2Y': return new Date(now.setFullYear(now.getFullYear() - 2)).toISOString().split('T')[0];
      case '5Y': return new Date(now.setFullYear(now.getFullYear() - 5)).toISOString().split('T')[0];
      default: return new Date(now.setFullYear(now.getFullYear() - 5)).toISOString().split('T')[0];
    }
  },

  // --- Debounce ---
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  // Star rating HTML
  stars(n, max = 5) {
    let html = '';
    for (let i = 1; i <= max; i++) {
      html += `<span class="star ${i <= n ? 'filled' : ''}">${i <= n ? '★' : '☆'}</span>`;
    }
    return html;
  },

  // Sentiment badge
  sentimentBadge(s) {
    const colors = { Bullish: '#22c55e', Neutral: '#f59e0b', Bearish: '#ef4444' };
    const c = colors[s] || '#8b90a0';
    return `<span class="badge" style="background:${c}20;color:${c};border:1px solid ${c}40">${s}</span>`;
  },

  // Status badge helper (used by CloudSync and MarketData)
  statusBadge(status, colorMap, labelMap, className) {
    const color = colorMap[status] || '#8b90a0';
    const label = labelMap[status] || status;
    return `<span class="${className}" style="background:${color}20;color:${color};border:1px solid ${color}40;padding:2px 8px;border-radius:12px;font-size:0.75rem">${label}</span>`;
  },

  // Escape HTML
  escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

window.Utils = Utils;
