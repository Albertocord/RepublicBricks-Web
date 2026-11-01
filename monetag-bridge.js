/* Republic Bricks: voluntary Monetag Rewarded Interstitial, confirmed reward only. */
(() => {
  'use strict';
  const config = window.RepublicBricksMonetagConfig || {};
  let unity, target, sdkLoading, active, blocked = false;
  const inTelegram = () => Boolean(window.Telegram?.WebApp?.initData);
  function configured() {
    if (config.enabled !== true || !/^\d+$/.test(config.zoneId)) return false;
    try { const url = new URL(config.sdkUrl); return url.protocol === 'https:' && !url.username && !url.password; }
    catch (_) { return false; }
  }
  const method = () => 'show_' + config.zoneId;
  const emit = (id, event) => { if (unity && target) unity.SendMessage(target, 'WebAdsEvent', id + ':' + event); };
  const announce = () => {
    if (unity && target) emit('', configured() && inTelegram() && !blocked ? 'ready' : 'unavailable');
  };
  function confirmAd() {
    const tg = window.Telegram.WebApp;
    const spanish = (tg.initDataUnsafe?.user?.language_code || 'es').startsWith('es');
    const message = spanish
      ? 'Para mostrar el anuncio y verificar la recompensa, Monetag recibe datos de Telegram, tu conexión y dispositivo. Puedes cancelar y esperar la recuperación normal de vidas.'
      : 'To show the ad and verify the reward, Monetag receives Telegram, connection and device data. You can cancel and wait for normal life recovery.';
    if (typeof tg.showPopup === 'function' && tg.isVersionAtLeast?.('6.2')) {
      return new Promise(resolve => tg.showPopup({
        title: spanish ? 'Anuncio de Monetag' : 'Monetag advertisement',
        message,
        buttons: [
          { id: 'watch', type: 'default', text: spanish ? 'Ver anuncio' : 'Watch ad' },
          { id: 'privacy', type: 'default', text: spanish ? 'Privacidad' : 'Privacy' },
          { id: 'cancel', type: 'cancel' }
        ]
      }, button => {
        if (button === 'privacy') tg.openLink('https://monetag.com/privacy/');
        resolve(button === 'watch');
      }));
    }
    return Promise.resolve(typeof window.confirm === 'function' && window.confirm(message + '\nhttps://monetag.com/privacy/'));
  }
  function loadSdk() {
    if (typeof window[method()] === 'function') return Promise.resolve();
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Monetag SDK timeout')), 15000);
      script.src = config.sdkUrl; script.async = true;
      script.setAttribute('data-zone', config.zoneId);
      script.setAttribute('data-sdk', method());
      script.onload = () => finish(typeof window[method()] === 'function' ? null : new Error('Monetag method missing'));
      script.onerror = () => finish(new Error('Monetag SDK unavailable'));
      document.head.appendChild(script);
    }).finally(() => { sdkLoading = null; });
    return sdkLoading;
  }
  async function show(id) {
    if (active) return;
    if (!configured() || !inTelegram() || blocked) { emit(id, 'error'); return; }
    const attempt = { ended: false };
    active = attempt;
    let watchdog;
    const finish = event => {
      if (attempt.ended) return;
      attempt.ended = true; clearTimeout(watchdog); active = null;
      emit(id, event);
    };
    try {
      if (!await confirmAd()) { finish('skipped'); return; }
      await loadSdk();
      watchdog = setTimeout(() => {
        // No documented SDK cancellation API: prevent a second overlapping ad until the app reloads.
        blocked = true; finish('timeout'); announce();
      }, 180000);
      // Default format is Rewarded Interstitial. No popups, automatic ads or preloads on page open.
      const result = await window[method()]({ ymid: id, requestVar: 'recover_lives' });
      if (attempt.ended) return;
      const matches = result && String(result.zone_id) === config.zoneId && result.variable2 === id;
      if (matches && result.reward_event_type === 'valued') {
        emit(id, 'earned'); finish('closed');
      } else finish('skipped');
    } catch (_) { finish('error'); }
  }
  window.RepublicBricksAds = Object.freeze({
    register(name) { target = name; announce(); },
    attachUnity(instance) { unity = instance; announce(); },
    show
  });
})();
