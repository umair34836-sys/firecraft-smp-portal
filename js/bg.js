(function () {
  /* Skip canvas on mobile or low-end devices to save battery and CPU */
  if (window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  document.body.prepend(canvas);

  var ctx = canvas.getContext('2d');
  var W, H, particles = [];

  var COLORS = ['#ff8fe3', '#ffa827', '#c8ff9a', '#35d07f', '#ffb3f0', '#ffd580'];
  var N = 35;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkp(y) {
    return {
      x: rand(0, W),
      y: y !== undefined ? y : rand(0, H),
      r: rand(1.2, 4.0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vy: rand(-0.35, -0.07),
      vx: rand(-0.1, 0.1),
      alpha: rand(0.15, 0.7),
      aDir: Math.random() > 0.5 ? 1 : -1,
      aSpd: rand(0.003, 0.01),
      phase: rand(0, Math.PI * 2),
    };
  }

  function init() {
    resize();
    particles = [];
    for (var i = 0; i < N; i++) particles.push(mkp());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var t = Date.now() * 0.001;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.y += p.vy;
      p.x += p.vx + Math.sin(t * 0.45 + p.phase) * 0.09;

      p.alpha += p.aDir * p.aSpd;
      if (p.alpha > 0.78) p.aDir = -1;
      if (p.alpha < 0.06) p.aDir = 1;

      if (p.y < -12) {
        particles[i] = mkp(H + 12);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.r * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();
