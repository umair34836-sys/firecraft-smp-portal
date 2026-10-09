(function () {
  // ── Notice bar (shown once per session) ─────────────────────────────────
  if (!localStorage.getItem('fc_notice')) {
    var bar = document.createElement('div');
    bar.id = 'adsNoticeBar';
    bar.style.cssText = 'background:linear-gradient(90deg,#1a0a00,#150d18);border-bottom:1px solid #ff8a0030;padding:10px 16px;text-align:center;font-size:13px;color:#bbb;position:relative;';
    bar.innerHTML = '❤️ <strong style="color:#fff;">FireCraft is 100% free</strong> — ads help us cover server costs. We appreciate your support! <button style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#666;font-size:18px;cursor:pointer;line-height:1;">×</button>';
    bar.querySelector('button').onclick = function () {
      bar.style.display = 'none';
      localStorage.setItem('fc_notice', '1');
    };
    var header = document.querySelector('header');
    if (header) header.insertAdjacentElement('afterend', bar);
    else document.body.prepend(bar);
  }

  // ── Apply Ad Modal ───────────────────────────────────────────────────────
  var adPushed = false;
  var modalTimer = null;

  function createModal() {
    if (document.getElementById('applyAdModal')) return;
    var el = document.createElement('div');
    el.id = 'applyAdModal';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.93);align-items:center;justify-content:center;flex-direction:column;';
    el.innerHTML = [
      '<div style="background:#111317;border:1px solid #ff3b3035;border-radius:20px;padding:28px 24px;max-width:460px;width:92%;text-align:center;box-shadow:0 0 60px #ff3b3020;position:relative;">',
        '<div style="font-size:11px;color:#ff8a00;font-weight:700;letter-spacing:2.5px;margin-bottom:10px;opacity:0.7;">A MESSAGE FROM US</div>',
        '<div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:10px;">🔥 We Appreciate Your Support</div>',
        '<div style="background:#1a1018;border-left:3px solid #ff8a00;border-radius:10px;padding:14px 16px;text-align:left;margin-bottom:16px;">',
          '<p style="font-size:13px;color:#ccc;line-height:1.7;margin:0;">',
            'We know ads aren\'t the most enjoyable experience — and we genuinely apologize for that.<br><br>',
            '<strong style="color:#fff;">FireCraft SMP is completely free.</strong> We never charge for whitelist, ranks, or anything else. Running a Minecraft server costs real money — hosting, plugins, and maintenance — all of which comes out of our own pockets.<br><br>',
            'These ads help us <strong style="color:#ff8a00;">keep the server alive and running for you</strong>, without ever asking you to pay a single rupee. Your patience means the world to us. ❤️',
          '</p>',
        '</div>',
        '<div style="min-height:90px;background:#0d0d0f;border-radius:12px;overflow:hidden;border:1px solid #ffffff08;margin-bottom:18px;display:flex;align-items:center;justify-content:center;">',
          '<ins class="adsbygoogle fc-interstitial-ad" style="display:block;min-height:0;width:100%" data-ad-client="ca-pub-4837345120897086" data-ad-slot="XXXXXXXXXX" data-ad-format="rectangle" data-full-width-responsive="true"></ins>',
        '</div>',
        '<div style="color:#777;font-size:13px;margin-bottom:14px;">Redirecting in <span id="adModalCountdown" style="color:#ff8a00;font-weight:700;font-size:16px;">5</span>s…</div>',
        '<div style="background:#1a1a1f;border-radius:8px;height:4px;overflow:hidden;margin-bottom:16px;"><div id="adModalBar" style="height:100%;background:linear-gradient(90deg,#ff3b30,#ff8a00);width:100%;transition:width 1s linear;"></div></div>',
        '<button id="adModalSkip" style="display:none;background:linear-gradient(135deg,#ff3b30,#ff8a00);color:#fff;border:none;border-radius:10px;padding:10px 28px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;">Continue to Apply →</button>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
  }

  function openApplyModal(e) {
    if (e) e.preventDefault();
    createModal();
    var modal = document.getElementById('applyAdModal');
    modal.style.display = 'flex';

    if (!adPushed) {
      adPushed = true;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (err) {}
    }

    var count = 5;
    var countEl = document.getElementById('adModalCountdown');
    var skipBtn = document.getElementById('adModalSkip');
    var bar = document.getElementById('adModalBar');

    bar.style.width = '100%';
    skipBtn.style.display = 'none';
    countEl.textContent = count;

    if (modalTimer) clearInterval(modalTimer);
    modalTimer = setInterval(function () {
      count--;
      countEl.textContent = count;
      bar.style.width = (count / 5 * 100) + '%';
      if (count <= 3) skipBtn.style.display = 'inline-block';
      if (count <= 0) { clearInterval(modalTimer); closeAndGo(); }
    }, 1000);

    skipBtn.onclick = function () { clearInterval(modalTimer); closeAndGo(); };
  }

  function closeAndGo() {
    var modal = document.getElementById('applyAdModal');
    if (modal) modal.style.display = 'none';
    var applySection = document.getElementById('apply');
    if (applySection) applySection.scrollIntoView({ behavior: 'smooth' });
  }

  window.showApplyAd = openApplyModal;

  document.addEventListener('DOMContentLoaded', function () {
    var heroBtn = document.getElementById('heroApplyBtn');
    if (heroBtn) heroBtn.addEventListener('click', openApplyModal);
  });
})();
