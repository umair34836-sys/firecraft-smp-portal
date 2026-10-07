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
    try { return Date.now() - (parseInt(localStorage.getItem(PU_KEY), 10) || 0) > PU_TTL; }
    catch (_) { return true; }
  }

  function puFire() {
    if (!puCanFire()) return;
    try { localStorage.setItem(PU_KEY, String(Date.now())); } catch (_) {}
    /* Must be triggered inside a real click event so browsers allow window.open */
    var w = window.open(DIRECT_URL, '_blank', 'noopener,noreferrer');
    /* If blocked, fall back to a hidden anchor click */
    if (!w || w.closed || typeof w.closed === 'undefined') {
      var a = document.createElement('a');
      a.href = DIRECT_URL;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:0;height:0;';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); }, 500);
    }
  }

  /* Attach to the first real user click — removes itself immediately after */
  document.addEventListener('click', function onFirstClick() {
    document.removeEventListener('click', onFirstClick);
    puFire();
  });

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
