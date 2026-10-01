/* FireCraft SMP — PWA Install + Push Notification Manager */
(function () {

  /* ── Register service worker ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) {
        console.warn('SW registration failed:', e);
      });
    });
  }

  /* ── Install prompt (Add to Home Screen) ── */
  var deferredPrompt = null;
  var installBanner = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById('fc-install-banner')) return;
    installBanner = document.createElement('div');
    installBanner.id = 'fc-install-banner';
    installBanner.innerHTML = [
      '<img src="/images/logo-192.png" alt="" style="width:36px;height:36px;border-radius:8px;flex-shrink:0;">',
      '<div style="flex:1;min-width:0;">',
        '<strong style="display:block;font-size:14px;color:#f0ffe8;">Install FireCraft App</strong>',
        '<span style="font-size:12px;color:#8ab899;">Add to home screen for quick access</span>',
      '</div>',
      '<button id="fc-install-btn" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#ff8fe3,#ffa827);border:0;color:#fff;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0;">Install</button>',
      '<button id="fc-install-x" style="background:none;border:0;color:#8ab899;font-size:20px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1;">&times;</button>',
    ].join('');
    installBanner.style.cssText = [
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
      'display:flex;align-items:center;gap:12px;',
      'background:#0e1f10;border:1px solid #1a4a1a;border-radius:16px;',
      'padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.4);',
      'z-index:999;width:min(380px,92vw);',
      'animation:fcSlideUp .35s ease;',
    ].join('');
    document.body.appendChild(installBanner);

    document.getElementById('fc-install-btn').onclick = function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        if (installBanner) installBanner.remove();
      });
    };
    document.getElementById('fc-install-x').onclick = function () {
      if (installBanner) installBanner.remove();
      try { localStorage.setItem('fc_install_dismissed', '1'); } catch (e) {}
    };
  }

  /* ── Push notification permission UI ── */
  function canPush() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function showNotifBar() {
    if (!canPush()) return;
    if (Notification.permission !== 'default') return;
    try { if (localStorage.getItem('fc_notif_dismissed')) return; } catch (e) {}

    var bar = document.createElement('div');
    bar.id = 'fc-notif-bar';
    bar.innerHTML = [
      '<span style="font-size:22px;">🌿</span>',
      '<div style="flex:1;min-width:0;">',
        '<strong style="display:block;font-size:14px;color:#f0ffe8;">Stay Updated</strong>',
        '<span style="font-size:12px;color:#8ab899;">Get notified for server events, announcements & whitelist updates</span>',
      '</div>',
      '<button id="fc-notif-allow" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#ff8fe3,#ffa827);border:0;color:#fff;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Enable 🔔</button>',
      '<button id="fc-notif-x" style="background:none;border:0;color:#8ab899;font-size:20px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1;">&times;</button>',
    ].join('');
    bar.style.cssText = [
      'position:fixed;top:70px;left:50%;transform:translateX(-50%);',
      'display:flex;align-items:center;gap:12px;',
      'background:#0e1f10;border:1px solid #ff8fe340;border-radius:14px;',
      'padding:14px 16px;box-shadow:0 8px 30px rgba(255,143,227,.12);',
      'z-index:999;width:min(440px,92vw);',
      'animation:fcSlideDown .35s ease;',
    ].join('');
    document.body.appendChild(bar);

    document.getElementById('fc-notif-allow').onclick = function () {
      requestPush(bar);
    };
    document.getElementById('fc-notif-x').onclick = function () {
      bar.remove();
      try { localStorage.setItem('fc_notif_dismissed', '1'); } catch (e) {}
    };
  }

  function requestPush(bar) {
    Notification.requestPermission().then(function (perm) {
      if (bar) bar.remove();
      if (perm === 'granted') {
        showToast('🔔 Notifications enabled! You\'ll hear from us soon.');
        subscribeUser();
      }
    });
  }

  function subscribeUser() {
    navigator.serviceWorker.ready.then(function (reg) {
      /* VAPID public key — replace with your own from web-push or OneSignal */
      var VAPID_PUBLIC = 'REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY';
      if (VAPID_PUBLIC.startsWith('REPLACE')) return;
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      }).then(function (sub) {
        console.log('Push subscription:', JSON.stringify(sub));
        /* Send `sub` to your server / Firebase function to store */
      }).catch(function (e) {
        console.warn('Push subscribe failed:', e);
      });
    });
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* ── Toast helper ── */
  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3000);
  }

  /* ── CSS animations ── */
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes fcSlideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
    '@keyframes fcSlideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
  ].join('');
  document.head.appendChild(style);

  /* ── Delay bars so page loads first ── */
  window.addEventListener('load', function () {
    setTimeout(showNotifBar, 4000);
  });

})();
