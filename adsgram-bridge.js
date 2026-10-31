/* Republic Bricks: rewarded test ads. This public block ID is not a credential. */
(() => {
  'use strict';
  const config = Object.freeze({ blockId: '57235', debug: true, debugConsole: false, debugBannerType: 'RewardedVideo' });
  let unity, target, controller, sdkLoading, active;
  const inTelegram = () => Boolean(window.Telegram?.WebApp?.initData);
  const emit = (id, event) => {
    if (unity && target) unity.SendMessage(target, 'WebAdsEvent', id + ':' + event);
  };
  const announce = () => { if (unity && target) emit('', inTelegram() ? 'ready' : 'unavailable'); };

  function loadSdk() {
    if (window.Adsgram) return Promise.resolve();
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
      const timer = setTimeout(() => finish(new Error('AdsGram SDK timeout')), 15000);
      script.src = 'https://sad.adsgram.ai/js/sad.min.js';
      script.async = true;
      script.onload = () => finish(window.Adsgram ? null : new Error('AdsGram SDK missing'));
      script.onerror = () => finish(new Error('AdsGram SDK unavailable'));
      document.head.appendChild(script);
    }).finally(() => { sdkLoading = null; });
    return sdkLoading;
  }

  async function show(id) {
    // A duplicate request must not close or reward the presentation already in flight.
    if (active) return;
    if (!inTelegram()) { emit(id, 'error'); return; }
    const attempt = { id, earned: false, ended: false };
    active = attempt;
    let rewardListener, watchdog;
    function finish(event) {
      if (attempt.ended) return;
      attempt.ended = true; clearTimeout(watchdog);
      if (rewardListener) {
        try { controller.removeEventListener('onReward', rewardListener); } catch (_) { /* cleanup only */ }
      }
      active = null;
      emit(id, event);
    }
    try {
      await loadSdk();
      if (!controller) controller = window.Adsgram.init({ ...config });
      rewardListener = () => {
        if (active !== attempt || attempt.ended || attempt.earned) return;
        attempt.earned = true;
        emit(id, 'earned');
      };
      controller.addEventListener('onReward', rewardListener);
      watchdog = setTimeout(() => {
        finish('error');
        try { controller.destroy(); } catch (_) { /* SDK may already be closed */ }
      }, 180000);
      const result = await controller.show();
      if (attempt.ended) return;
      finish(attempt.earned ? 'closed' : result?.error ? 'error' : 'skipped');
    } catch (error) {
      // A confirmed reward remains earned even if the provider subsequently fails to dismiss cleanly.
      finish(attempt.earned ? 'closed' : error?.error === false ? 'skipped' : 'error');
    }
  }

  window.RepublicBricksAds = Object.freeze({
    config,
    register(name) { target = name; announce(); },
    attachUnity(instance) { unity = instance; announce(); },
    show
  });
})();
