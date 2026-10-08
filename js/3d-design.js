/* FireCraft SMP — 3D Design Interactions */
(function () {
  'use strict';

  const hasHover = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const noMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function lerpVal(a, b, t) { return a + (b - a) * t }

  /* ── Cursor: add class to body so CSS activates cursor:none ── */
  if (hasHover) {
    document.body.classList.add('cursor-none');
    const cur = document.getElementById('cur');
    if (cur) {
      document.addEventListener('mousemove', e => {
        cur.style.left = e.clientX + 'px';
        cur.style.top  = e.clientY + 'px';
      }, { passive: true });

      document.querySelectorAll('a,button,.pscene,.chip3d,.stcard,.lspanel').forEach(el => {
        el.addEventListener('mouseenter', () => cur.classList.add('xl'));
        el.addEventListener('mouseleave', () => cur.classList.remove('xl'));
      });
    }
  }

  /* ── Hero LERP tilt ── */
  if (hasHover && !noMotion) {
    const heroCont  = document.getElementById('hero-cont');
    const heroScene = document.getElementById('hero-scene');
    const heroEl    = document.getElementById('home');
    if (heroCont && heroScene && heroEl) {
      let rotX = 0, rotY = 0, tRotX = 0, tRotY = 0;
      let origX = 50, origY = 50, tOrigX = 50, tOrigY = 50;
      const TLRP = 0.055;
      let heroRunning = false;

      function heroLoop() {
        rotX  = lerpVal(rotX,  tRotX,  TLRP);
        rotY  = lerpVal(rotY,  tRotY,  TLRP);
        origX = lerpVal(origX, tOrigX, TLRP);
        origY = lerpVal(origY, tOrigY, TLRP);
        heroScene.style.transform = `rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)`;
        heroCont.style.perspectiveOrigin = `${origX.toFixed(2)}% ${origY.toFixed(2)}%`;
        const stillMoving =
          Math.abs(rotX - tRotX) > 0.005 || Math.abs(rotY - tRotY) > 0.005 ||
          Math.abs(origX - tOrigX) > 0.02 || Math.abs(origY - tOrigY) > 0.02;
        if (stillMoving) { requestAnimationFrame(heroLoop) } else { heroRunning = false }
      }

      heroEl.addEventListener('mousemove', e => {
        const r = heroEl.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top) / r.height;
        tRotX = (ny - 0.5) * -12; tRotY = (nx - 0.5) * 14;
        tOrigX = 30 + nx * 40; tOrigY = 30 + ny * 40;
        if (!heroRunning) { heroRunning = true; requestAnimationFrame(heroLoop) }
      }, { passive: true });

      heroEl.addEventListener('mouseleave', () => {
        tRotX = 0; tRotY = 0; tOrigX = 50; tOrigY = 50;
        if (!heroRunning) { heroRunning = true; requestAnimationFrame(heroLoop) }
      });
    }
  }

  /* ── Lifesteal panel tilt ── */
  if (hasHover && !noMotion) {
    document.querySelectorAll('.lspanel').forEach(panel => {
      const card = panel.querySelector('.lscard');
      if (!card) return;
      let lrx = 0, lry = 0, trx = 0, tRy = 0, running = false, hovering = false;
      const LLP = 0.07;

      function pLoop() {
        lrx = lerpVal(lrx, trx, LLP); lry = lerpVal(lry, tRy, LLP);
        card.style.transform = `rotateX(${lrx.toFixed(3)}deg) rotateY(${lry.toFixed(3)}deg)`;
        if (Math.abs(lrx - trx) > 0.01 || Math.abs(lry - tRy) > 0.01) {
          requestAnimationFrame(pLoop);
        } else {
          running = false;
          if (!hovering) card.style.transform = '';
        }
      }

      panel.addEventListener('mousemove', e => {
        const r = panel.getBoundingClientRect();
        trx = -(e.clientY - r.top) / r.height * 14 + 7;
        tRy =  (e.clientX - r.left) / r.width * 14 - 7;
        hovering = true;
        if (!running) { running = true; requestAnimationFrame(pLoop) }
      }, { passive: true });

      panel.addEventListener('mouseleave', () => {
        hovering = false; trx = 0; tRy = 0;
        if (!running) { running = true; requestAnimationFrame(pLoop) }
      });
    });
  }

  /* ── Step card tilt ── */
  if (hasHover && !noMotion) {
    document.querySelectorAll('.stwrap').forEach(wrap => {
      const card = wrap.querySelector('.stcard');
      if (!card) return;
      let lrx = 0, lry = 0, trx = 0, tRy = 0, running = false;
      const SLP = 0.08;

      function sLoop() {
        lrx = lerpVal(lrx, trx, SLP); lry = lerpVal(lry, tRy, SLP);
        const tz = ((Math.abs(lrx) + Math.abs(lry)) * 0.3).toFixed(2);
        card.style.transform = `rotateX(${lrx.toFixed(3)}deg) rotateY(${lry.toFixed(3)}deg) translateZ(${tz}px)`;
        if (Math.abs(lrx - trx) > 0.01 || Math.abs(lry - tRy) > 0.01) {
          requestAnimationFrame(sLoop);
        } else {
          running = false; card.style.transform = '';
        }
      }

      wrap.addEventListener('mousemove', e => {
        const r = wrap.getBoundingClientRect();
        trx = -(e.clientY - r.top) / r.height * 16 + 8;
        tRy =  (e.clientX - r.left) / r.width * 16 - 8;
        if (!running) { running = true; requestAnimationFrame(sLoop) }
      }, { passive: true });

      wrap.addEventListener('mouseleave', () => {
        trx = 0; tRy = 0;
        if (!running) { running = true; requestAnimationFrame(sLoop) }
      });
    });
  }

  /* ── Touch: tap to flip power cards ── */
  if (!hasHover) {
    document.querySelectorAll('.pscene').forEach(scene => {
      scene.addEventListener('click', () => scene.classList.toggle('flipped'));
    });
  }

  /* ── Scroll-driven fallback (non-Chrome) ── */
  const CSS_SCROLL = CSS.supports('animation-timeline', 'scroll()');
  if (!CSS_SCROLL) {
    const scrollItems = document.querySelectorAll('.scroll-tilt');
    let scrollTicking = false;
    function updateScrollRotations() {
      const vh = window.innerHeight;
      scrollItems.forEach(el => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const clamped = Math.max(-1, Math.min(1, (vh / 2 - center) / (vh / 2)));
        el.style.transform = `perspective(1100px) rotateX(${clamped * -10}deg)`;
        el.style.opacity = 1 - Math.abs(clamped) * 0.45;
      });
      scrollTicking = false;
    }
    window.addEventListener('scroll', () => {
      if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(updateScrollRotations) }
    }, { passive: true });
    updateScrollRotations();
  }

  /* ── Scroll reveal fallback (non-Chrome) ── */
  if (!CSS_SCROLL) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target) }
      });
    }, { threshold: 0.07 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  }

  /* ── Animated counters ── */
  function countUp(el) {
    const t = +el.dataset.target;
    let s;
    (function step(ts) {
      if (!s) s = ts;
      const p = Math.min((ts - s) / 1300, 1);
      el.textContent = Math.floor(p * t);
      if (p < 1) { requestAnimationFrame(step) } else { el.textContent = t }
    })(performance.now());
  }
  const chipsRow = document.querySelector('.chips-row');
  if (chipsRow) {
    new IntersectionObserver(en => {
      en.forEach(e => {
        if (e.isIntersecting) {
          e.target.querySelectorAll('[data-target]').forEach(countUp);
        }
      });
    }, { threshold: 0.3 }).observe(chipsRow);
  }

  /* ── Hearts in lifesteal showcase ── */
  const hd = document.getElementById('hearts');
  if (hd) {
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      s.className = 'hrt' + (i >= 7 ? ' dead' : '');
      s.textContent = i < 7 ? '❤️' : '🖤';
      s.style.setProperty('--d', (i * 0.14) + 's');
      hd.appendChild(s);
    }
  }

  /* ── Liquid glass filter — Chromium desktop only ── */
  const isChromiumDesktop = hasHover && navigator.userAgentData?.brands?.some(b => b.brand === 'Chromium');
  if (isChromiumDesktop) {
    document.querySelectorAll('.glass20, .topbar, .ctawrap').forEach(el => el.classList.add('refractive'));
  }

  /* ── Button press depth ── */
  document.querySelectorAll('.dbtn').forEach(btn => {
    btn.addEventListener('mousedown',  () => { btn.style.transform = 'translateY(3px) translateZ(-8px) scale(.97)' });
    btn.addEventListener('mouseup',    () => { btn.style.transform = '' });
    btn.addEventListener('mouseleave', () => { btn.style.transform = '' });
    btn.addEventListener('touchstart', () => { btn.style.transform = 'scale(.97)' }, { passive: true });
    btn.addEventListener('touchend',   () => { btn.style.transform = '' });
  });

})();
