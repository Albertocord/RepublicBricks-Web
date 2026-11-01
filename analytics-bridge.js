/* Optional game statistics. No Google script or events before the player's choice. */
(() => {
  'use strict';
  const config = window.RepublicBricksAnalyticsConfig || {};
  const consentKey = 'rb.analytics.choice.v1', dedupeKey = 'rb.analytics.events.v1';
  const consentLifetime = 180 * 86400000;
  let language = 'es', allowed = false, initialized = false, tagConfigured = false, domBound = false;
  const measurementId = config.measurementId || '';
  const validConfig = () => config.enabled === true && /^G-[A-Z0-9]+$/.test(measurementId);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* gameplay remains available */ } };
  let dedupe = null;
  const tag = function() { window.dataLayer.push(arguments); };

  function enableTag() {
    if (!allowed || !validConfig()) return;
    window['ga-disable-' + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    if (tagConfigured) { tag('consent', 'update', { analytics_storage: 'granted' }); return; }
    tagConfigured = true;
    tag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    tag('consent', 'update', { analytics_storage: 'granted' });
    tag('js', new Date());
    tag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_prefix: 'rb',
      cookie_path: '/RepublicBricks-Web/',
      page_location: 'https://albertocord.github.io/RepublicBricks-Web/',
      page_referrer: '',
      page_title: 'Republic Bricks'
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    script.onerror = () => { script.remove(); tagConfigured = false; };
    document.head.appendChild(script);
  }

  function clearAnalyticsData() {
    dedupe = { day: '', seen: [] };
    try { localStorage.removeItem(dedupeKey); } catch (_) { /* optional storage */ }
    try {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim();
        if (!name.startsWith('rb_ga')) continue;
        for (const domain of ['', '; Domain=' + location.hostname, '; Domain=.' + location.hostname]) {
          for (const path of ['/RepublicBricks-Web/', '/'])
            document.cookie = name + '=; Max-Age=0; Path=' + path + domain + '; SameSite=Lax; Secure';
        }
      }
    } catch (_) { /* browser may disable cookies */ }
  }

  function setChoice(value) {
    allowed = value === true;
    write(consentKey, { allowed, at: Date.now() });
    if (allowed) enableTag();
    else {
      if (validConfig()) window['ga-disable-' + measurementId] = true;
      if (tagConfigured) tag('consent', 'update', { analytics_storage: 'denied' });
      clearAnalyticsData();
    }
    closePreferences();
  }
  function closePreferences() {
    const dialog = document.getElementById('analytics-dialog');
    if (dialog) dialog.hidden = true;
    document.getElementById('unity-canvas')?.focus();
  }
  function openPreferences(locale) {
    if (locale) language = locale;
    const dialog = document.getElementById('analytics-dialog');
    if (!dialog) return;
    const es = language === 'es';
    document.getElementById('analytics-title').textContent = es ? 'Estadísticas de uso' : 'Usage statistics';
    document.getElementById('analytics-description').textContent = es
      ? '¿Permites medir jugadores diarios, partidas y niveles superados con Google Analytics? Usa un identificador de navegador. No enviamos tu nombre ni tu cuenta de Telegram. Es opcional y puedes cambiarlo en Ajustes.'
      : 'Allow Google Analytics to measure daily players, games and completed levels? It uses a browser identifier. We do not send your name or Telegram account. This is optional and can be changed in Settings.';
    document.getElementById('analytics-accept').textContent = es ? 'Permitir estadísticas' : 'Allow statistics';
    document.getElementById('analytics-reject').textContent = es ? 'No compartir' : 'Do not share';
    document.getElementById('analytics-close').textContent = es ? 'Volver al juego' : 'Back to game';
    document.getElementById('analytics-policy').textContent = es ? 'Política de privacidad' : 'Privacy policy';
    if (!domBound) {
      domBound = true;
      document.getElementById('analytics-accept').addEventListener('click', () => setChoice(true));
      document.getElementById('analytics-reject').addEventListener('click', () => setChoice(false));
      document.getElementById('analytics-close').addEventListener('click', closePreferences);
    }
    dialog.hidden = false;
    document.getElementById('analytics-reject').focus();
  }
  function initialize(locale) {
    language = locale || 'es';
    if (initialized || !validConfig()) return;
    initialized = true;
    const choice = read(consentKey, null);
    if (choice && typeof choice.allowed === 'boolean' && choice.at <= Date.now() && Date.now() - choice.at < consentLifetime) {
      allowed = choice.allowed;
      if (allowed) enableTag(); else clearAnalyticsData();
    } else {
      clearAnalyticsData();
      openPreferences(language);
    }
  }
  function emit(name, params) {
    enableTag();
    // Every parameter is constructed here; raw Telegram data, attempt IDs, URLs and names are excluded.
    tag('event', name, { ...params, send_to: measurementId, game_version: 'web-v1', transport_type: 'beacon' });
  }
  function once(key) {
    loadDedupe();
    if (dedupe.seen.includes(key)) return false;
    dedupe.seen.push(key);
    if (dedupe.seen.length > 1000) dedupe.seen = dedupe.seen.slice(-1000);
    write(dedupeKey, dedupe);
    return true;
  }
  function loadDedupe() {
    if (dedupe) return;
    const stored = read(dedupeKey, null);
    dedupe = stored && typeof stored.day === 'string' && Array.isArray(stored.seen)
      ? { day: stored.day, seen: stored.seen.filter(value => typeof value === 'string').slice(-1000) }
      : { day: '', seen: [] };
  }
  function track(json) {
    try {
      if (!allowed || !validConfig()) return;
      const data = JSON.parse(json);
      if (!Number.isInteger(data.level) || data.level < 1 || data.level > 50 || typeof data.attemptId !== 'string' || data.attemptId.length > 80) return;
      const params = { level_name: 'Nivel ' + String(data.level).padStart(2, '0'), level_number: data.level, free_replay: data.freeReplay === true ? 1 : 0 };
      if (data.kind === 'shot') {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone || 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
        loadDedupe();
        if (dedupe.day !== day) { dedupe.day = day; write(dedupeKey, dedupe); emit('jugador_diario', {}); }
        if (data.newAttempt === true && once('start:' + data.attemptId)) emit('partida_iniciada', params);
      } else if (data.kind === 'end' && ['win','loss','abandon'].includes(data.outcome) && once('end:' + data.attemptId)) {
        emit('partida_finalizada', { ...params, outcome: data.outcome });
        if (data.outcome === 'win') emit('nivel_superado', { ...params, first_clear: data.firstClear === true ? 1 : 0 });
      }
    } catch (_) { /* analytics must never break a shot, save or result */ }
  }
  window.RepublicBricksAnalytics = Object.freeze({ initialize, track, openPreferences });
})();
