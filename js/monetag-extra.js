/* ─────────────────────────────────────────────────────────────────
   FireCraft SMP — Monetag Extra Ads
   HOW TO FILL IN YOUR ZONE IDs:
     1. Go to Monetag Dashboard → Websites → Zones → + Add Zone
     2. Create a "Popunder" zone   → copy the numeric Zone ID → paste in POPUNDER_ZONE
     3. Create an "In-Page Push" zone → copy Zone ID → paste in INPAGE_ZONE
   ───────────────────────────────────────────────────────────────── */

(function () {

  /* ── ZONE IDs — fill these in ─────────────────────────────── */
  var POPUNDER_ZONE = 'REPLACE_POPUNDER_ZONE_ID';   // e.g. '12345678'
  var INPAGE_ZONE   = 'REPLACE_INPAGE_ZONE_ID';     // e.g. '12345679'
  /* ─────────────────────────────────────────────────────────── */

  /* ── Popunder: once per 24 h, fires only on first click ───── */
  var PU_KEY = 'fc_pu_last';
  var PU_TTL = 86400000; // 24 hours in ms

  function puCanFire() {
    try { return Date.now() - (parseInt(localStorage.getItem(PU_KEY)) || 0) > PU_TTL; }
    catch (_) { return true; }
  }

  function puLoad() {
    if (!puCanFire()) return;
    if (POPUNDER_ZONE.startsWith('REPLACE')) return; // not configured yet
    try { localStorage.setItem(PU_KEY, String(Date.now())); } catch (_) {}
    var s = document.createElement('script');
    s.setAttribute('data-cfasync', 'false');
    s.async = true;
    /* Monetag popunder script — the src domain comes from your Monetag zone code.
       Replace the full src string below with the one Monetag gives you, keeping
       only the src value (the part after src= in their <script> tag).           */
    s.src = '//thubanoa.com/1?z=' + POPUNDER_ZONE;
    (document.body || document.documentElement).appendChild(s);
  }

  /* Only fire popunder on the FIRST real user click — not on page load.
     This is the most user-friendly trigger: the user is already engaged. */
  document.addEventListener('click', function onFirstClick() {
    document.removeEventListener('click', onFirstClick);
    puLoad();
  });

  /* ── In-Page Push: loads immediately, non-intrusive widget ── */
  function inpageLoad() {
    if (INPAGE_ZONE.startsWith('REPLACE')) return; // not configured yet
    var s = document.createElement('script');
    s.src = '//socpush.com/push.min.js';
    s.setAttribute('data-zone', INPAGE_ZONE);
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Load In-Page Push after page is interactive to not delay rendering */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inpageLoad);
  } else {
    inpageLoad();
  }

})();
