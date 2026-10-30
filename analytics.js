/* First-party GA4 integration. Never read form fields or send link text/URLs. */
(() => {
  'use strict';
  if (window.housetecAnalytics) return;
  const ID = 'G-3BNE4X3FEK';
  const KEY = 'housetec.analytics.disabled';
  const pages = new Set(['/', '/index.html', '/ValueUp.dc.html', '/Assessment.dc.html', '/Contact.dc.html', '/Reservation.dc.html', '/kanagawa-baikyaku.html', '/hakuraku-baikyaku.html', '/rokkakubashi-baikyaku.html', '/privacy.html', '/rokkakubashi-souzoku-jirei.html', '/oguchi-souzoku-jirei.html']);
  const isProduction = window.location.hostname === 'housetec-lp.vercel.app';
  let disabled = false;
  try { disabled = window.localStorage.getItem(KEY) === '1'; } catch (_) {}
  let started = false;
  const leads = new Set();
  function safeURL(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.origin + (url.origin === window.location.origin && pages.has(url.pathname) ? url.pathname : '/');
    } catch (_) { return ''; }
  }
  function start() {
    if (started || disabled || !isProduction || !pages.has(window.location.pathname)) return;
    started = true;
    window['ga-disable-' + ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    // Recognize only our fixed public Business Profile link. Never forward query input.
    let campaign = {};
    try {
      const url = new URL(window.location.href);
      const expected = { utm_source: 'google', utm_medium: 'organic', utm_campaign: 'gbp_profile' };
      if (Object.entries(expected).every(([key, value]) =>
        url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value)) {
        campaign = { campaign_source: 'google', campaign_medium: 'organic', campaign_name: 'gbp_profile' };
      }
    } catch (_) {}
    const pageLocation = window.location.origin + window.location.pathname;
    const pageReferrer = safeURL(document.referrer);
    // Apply to all events, including events emitted by the Google library.
    window.gtag('set', { page_location: pageLocation, page_referrer: pageReferrer });
    window.gtag('config', ID, {
      ...campaign,
      page_location: pageLocation, page_referrer: pageReferrer,
      allow_google_signals: false, allow_ad_personalization_signals: false
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    script.id = 'housetec-google-tag';
    document.head.appendChild(script);
  }
  function event(name, params) {
    if (!started || disabled || typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params); } catch (_) {}
  }
  function updatePreference(off) {
    disabled = off;
    window['ga-disable-' + ID] = off;
    try { window.localStorage.setItem(KEY, off ? '1' : '0'); } catch (_) {}
    if (!off) start();
    const status = document.getElementById('analytics-status');
    if (status) status.textContent = disabled ? 'このブラウザのアクセス解析は停止中です。' : 'このブラウザのアクセス解析は有効です。';
  }
  window.housetecAnalytics = {
    trackLead(type) {
      if (!['assessment', 'contact', 'reservation'].includes(type) || leads.has(type)) return;
      leads.add(type);
      event('generate_lead', { form_type: type });
    },
    disable() { updatePreference(true); },
    enable() { updatePreference(false); }
  };
  window['ga-disable-' + ID] = disabled;
  document.addEventListener('click', e => {
    const chain = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    const anchor = chain.find(node => node && typeof node.getAttribute === 'function' && node.tagName === 'A');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      if (/^tel:/i.test(href)) event('contact_click', { contact_method: 'phone' });
      else {
        try { const url = new URL(href, window.location.href); if (url.protocol === 'https:' && url.hostname === 'lin.ee' && url.pathname === '/XPO76ZV') event('contact_click', { contact_method: 'line' }); } catch (_) {}
      }
    }
    const control = chain.find(node => node && typeof node.getAttribute === 'function' && node.getAttribute('data-analytics-preference'));
    if (control) updatePreference(control.getAttribute('data-analytics-preference') === 'off');
  });
  start();
  updatePreference(disabled);
})();
