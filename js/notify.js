/* FireCraft SMP — PWA Install + OneSignal Push Notifications */
(function () {

  /* ── Register service worker (for offline caching) ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  /* ── OneSignal push notifications ── */
  var OS_APP_ID = '078370fd-ffa0-4727-8137-063ed6e18d18';

  if (!OS_APP_ID.startsWith('REPLACE')) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    var script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    document.head.appendChild(script);

    OneSignalDeferred.push(function (OneSignal) {
      OneSignal.init({
        appId: OS_APP_ID,
        safari_web_id: 'web.onesignal.auto.34975c41-96f8-43c9-89c6-048b8e5234aa',
        notifyButton: { enable: false },
        welcomeNotification: {
          title: 'FireCraft SMP 🌿',
          message: 'Thanks for subscribing! You\'ll get server updates & announcements.',
        },
        promptOptions: { slidedown: { enabled: false } },
      }).then(function () {
        /* Show our custom bar after init */
        setTimeout(showNotifBar, 4000);
      });
    });
  }

  /* ── Custom "Enable Notifications" banner ── */
  function showNotifBar() {
    if (document.getElementById('fc-notif-bar')) return;
    try { if (localStorage.getItem('fc_notif_dismissed')) return; } catch (e) {}

    if (!window.OneSignal) return;

    window.OneSignal.Notifications.permission.then(function (granted) {
      if (granted) return; /* already subscribed */

      var bar = document.createElement('div');
      bar.id = 'fc-notif-bar';
      bar.innerHTML = [
        '<span style="font-size:22px;flex-shrink:0;">🔔</span>',
        '<div style="flex:1;min-width:0;">',
          '<strong style="display:block;font-size:14px;color:#f0ffe8;">Get Server Notifications</strong>',
          '<span style="font-size:12px;color:#8ab899;">Announcements, whitelist updates & events</span>',
        '</div>',
        '<button id="fc-notif-allow" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#ff8fe3,#ffa827);border:0;color:#fff;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Enable</button>',
        '<button id="fc-notif-x" style="background:none;border:0;color:#8ab899;font-size:22px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1;">&times;</button>',
      ].join('');
      bar.style.cssText = [
        'position:fixed;top:70px;left:50%;transform:translateX(-50%);',
        'display:flex;align-items:center;gap:12px;',
        'background:#0e1f10;border:1px solid #ff8fe340;border-radius:14px;',
        'padding:14px 16px;box-shadow:0 8px 30px rgba(255,143,227,.15);',
        'z-index:999;width:min(420px,92vw);',
        'animation:fcSlideDown .35s ease;',
      ].join('');
      document.body.appendChild(bar);

      document.getElementById('fc-notif-allow').onclick = function () {
        bar.remove();
        window.OneSignal.Slidedown.promptPush();
      };
      document.getElementById('fc-notif-x').onclick = function () {
        bar.remove();
        try { localStorage.setItem('fc_notif_dismissed', '1'); } catch (e) {}
      };
    });
  }

  /* ── PWA Install prompt (Add to Home Screen) ── */
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    try { if (localStorage.getItem('fc_install_dismissed')) return; } catch (e) {}
    setTimeout(showInstallBanner, 8000);
  });

  function showInstallBanner() {
    if (document.getElementById('fc-install-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'fc-install-banner';
    bar.innerHTML = [
      '<img src="/images/logo-192.png" alt="" style="width:34px;height:34px;border-radius:8px;flex-shrink:0;">',
      '<div style="flex:1;min-width:0;">',
        '<strong style="display:block;font-size:14px;color:#f0ffe8;">Install FireCraft App</strong>',
        '<span style="font-size:12px;color:#8ab899;">Add to home screen for quick access</span>',
      '</div>',
      '<button id="fc-install-btn" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#ff8fe3,#ffa827);border:0;color:#fff;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0;">Install</button>',
      '<button id="fc-install-x" style="background:none;border:0;color:#8ab899;font-size:22px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1;">&times;</button>',
    ].join('');
    bar.style.cssText = [
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
      'display:flex;align-items:center;gap:12px;',
      'background:#0e1f10;border:1px solid #1a4a1a;border-radius:16px;',
      'padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.4);',
      'z-index:999;width:min(380px,92vw);',
      'animation:fcSlideUp .35s ease;',
    ].join('');
    document.body.appendChild(bar);

    document.getElementById('fc-install-btn').onclick = function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        bar.remove();
      });
    };
    document.getElementById('fc-install-x').onclick = function () {
      bar.remove();
      try { localStorage.setItem('fc_install_dismissed', '1'); } catch (e) {}
    };
  }

  /* ── Animations ── */
  var s = document.createElement('style');
  s.textContent = '@keyframes fcSlideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
    + '@keyframes fcSlideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(s);

})();
