/* ─────────────────────────────────────────────────────────────────
   FireCraft SMP — Monetag In-Page Push
   Zone 11972570 — non-intrusive notification widget, no redirects.
   Monetag manages delivery frequency internally.
   ───────────────────────────────────────────────────────────────── */

(function () {

  /* In-Page Push loads after the page is interactive so it never
     delays rendering. It appears as a small dismissible widget —
     Monetag's script handles all delivery logic internally.        */
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
