(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var menuBtn = document.getElementById('menuBtn');
    var originalNav = document.getElementById('nav');
    if (!menuBtn || !originalNav) return;

    /* Build a full-screen overlay appended directly to body */
    var overlay = document.createElement('div');
    overlay.id = 'fc-mobile-nav';
    overlay.style.cssText = [
      'display:none;position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:#020e06;z-index:2147483647;',
      'flex-direction:column;overflow-y:auto;',
      'padding:0;margin:0;',
    ].join('');

    /* Header row inside overlay */
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #1a4a1a;min-height:64px;flex-shrink:0;';
    header.innerHTML = '<span style="font-weight:900;font-size:15px;color:#f0ffe8;letter-spacing:.5px;">FIRECRAFT <span style="color:#ffa827;">SMP</span></span>';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:0;color:#f0ffe8;font-size:24px;cursor:pointer;padding:4px 8px;line-height:1;';
    closeBtn.onclick = closeOverlay;
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    /* Nav links */
    var links = originalNav.querySelectorAll('a');
    links.forEach(function (link) {
      var item = document.createElement('a');
      item.href = link.href;
      item.textContent = link.textContent.trim();
      if (link.target) item.target = link.target;
      if (link.rel) item.rel = link.rel;
      item.style.cssText = [
        'display:block;padding:18px 24px;',
        'font-size:17px;font-weight:600;color:#f0ffe8;',
        'border-bottom:1px solid #1a4a1a44;',
        'text-decoration:none;',
      ].join('');
      /* Highlight active page */
      if (link.classList.contains('active')) {
        item.style.color = '#ff8fe3';
        item.style.background = '#1a4a1a33';
      }
      item.addEventListener('click', closeOverlay);
      overlay.appendChild(item);
    });

    document.body.appendChild(overlay);

    function openOverlay() {
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      menuBtn.textContent = '✕';
    }

    function closeOverlay() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      menuBtn.textContent = '☰';
    }

    /* Override the inline onclick set in each HTML file */
    menuBtn.onclick = function () {
      if (overlay.style.display === 'none' || !overlay.style.display) {
        openOverlay();
      } else {
        closeOverlay();
      }
    };
  });
})();
