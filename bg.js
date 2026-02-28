/* bg.js - Glassmorphism background */
(function() {
  const canvas = document.getElementById('bgCanvas');
  const ctx    = canvas.getContext('2d');

  let W, H, orbs = [];

  // ألوان هادية تناسب Glassmorphism
  const COLORS = ['#7c3aed','#4f46e5','#0ea5e9','#6d28d9','#1d4ed8'];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeOrb() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     250 + Math.random() * 400,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx:    (Math.random() - 0.5) * 0.15,
      vy:    (Math.random() - 0.5) * 0.15,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function initOrbs() {
    orbs = [];
    for (let i = 0; i < 4; i++) orbs.push(makeOrb());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // خلفية داكنة جداً
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, W, H);

    // الـ orbs الضبابية
    orbs.forEach(o => {
      o.phase += 0.005;
      o.x += o.vx + Math.sin(o.phase) * 0.2;
      o.y += o.vy + Math.cos(o.phase * 0.8) * 0.15;

      if (o.x < -o.r) o.x = W + o.r;
      if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r;
      if (o.y > H + o.r) o.y = -o.r;

      const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      grad.addColorStop(0, hexAlpha(o.color, 0.12));
      grad.addColorStop(0.5, hexAlpha(o.color, 0.04));
      grad.addColorStop(1, hexAlpha(o.color, 0));

      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  function hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  window.addEventListener('resize', () => { resize(); initOrbs(); });
  resize();
  initOrbs();
  draw();
})();
