/* ─────────────────────────────────────────────────────────────────
   FireCraft SMP — Monetag Extra Ads
   • Direct Link Popunder  — once per 24 h, only on first user click
   • In-Page Push (tag.min.js zone 11972570) — non-intrusive widget
   ───────────────────────────────────────────────────────────────── */

(function () {

  /* ── Direct Link Popunder ─────────────────────────────────────
     Opens the direct link in a new tab on the user's very first
     click on the page. localStorage cooldown of 24 h makes sure
     the same visitor is never hit more than once per day.        */
  var DIRECT_URL = 'https://uplcm.com/4/11972567';
  var PU_KEY     = 'fc_pu_last';
  var PU_TTL     = 86400000; // 24 hours in ms

  function puCanFire() {
    try {
      var last = parseInt(localStorage.getItem(PU_KEY), 10);
      if (!last || isNaN(last)) return true;
      return (Date.now() - last) > PU_TTL;
    } catch (_) { return true; }
  }

  /* KEY FIX: only attach the listener when the 24 h cooldown has passed.
     This prevents a new listener being added on every page navigation
     during the cooldown window, which was causing the "every click" bug. */
  if (puCanFire()) {
    document.addEventListener('click', function onFirstClick() {
      document.removeEventListener('click', onFirstClick);
      /* Double-check in case another tab fired it since this page loaded */
      if (!puCanFire()) return;
      try { localStorage.setItem(PU_KEY, String(Date.now())); } catch (_) {}
      window.open(DIRECT_URL, '_blank', 'noopener,noreferrer');
    });
  }

  /* ── In-Page Push (Social Bar) ────────────────────────────────
     Loads after the page is interactive so it never delays render.
     Appears as a small notification widget — user can dismiss it. */
  function inpageLoad() {
    (function (s) {
      s.dataset.zone = '11972570';
      s.src = 'https://al5sm.com/tag.min.js';
    })(([document.documentElement, document.body].filter(Boolean).pop())
        .appendChild(document.createElement('script')));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inpageLoad);
  } else {
    inpageLoad();
  }

})();
