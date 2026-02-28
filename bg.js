/* bg.js - خلفية متحركة بالـ Canvas */
(function() {
  const canvas = document.getElementById('bgCanvas');
  const ctx    = canvas.getContext('2d');

  let W, H, particles = [], orbs = [];
  const COLORS = ['#4fc3f7','#ce93d8','#69f0ae','#ffd54f'];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /* ── Orbs (الكرات الكبيرة الناعمة) ─────────────────── */
  function makeOrb() {
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  200 + Math.random() * 300,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function initOrbs() {
    orbs = [];
    for (let i = 0; i < 3; i++) orbs.push(makeOrb());
  }

  function drawOrbs() {
    orbs.forEach(o => {
      o.phase += 0.008;
      o.x += o.vx + Math.sin(o.phase) * 0.4;
      o.y += o.vy + Math.cos(o.phase * 0.7) * 0.3;

      // bounce
      if (o.x < -o.r) o.x = W + o.r;
      if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r;
      if (o.y > H + o.r) o.y = -o.r;

      const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      grad.addColorStop(0, hexAlpha(o.color, 0.07));
      grad.addColorStop(1, hexAlpha(o.color, 0));
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });
  }

  /* ── Particles (النجوم الصغيرة) ─────────────────────── */
  function makeParticle() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     0.5 + Math.random() * 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 0.1 + Math.random() * 0.5,
      vy:    -0.1 - Math.random() * 0.2,
      vx:    (Math.random() - 0.5) * 0.1,
      life:  0,
      maxLife: 200 + Math.random() * 300,
    };
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < 80; i++) particles.push(makeParticle());
  }

  function drawParticles() {
    particles.forEach((p, i) => {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;

      // fade in/out
      const progress = p.life / p.maxLife;
      const fade = progress < 0.1
        ? progress / 0.1
        : progress > 0.8
          ? (1 - progress) / 0.2
          : 1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(p.color, p.alpha * fade);
      ctx.fill();

      // رجّع الجسيم لما يموت
      if (p.life >= p.maxLife || p.y < -10) {
        particles[i] = makeParticle();
        particles[i].y = H + 10; // ابدأ من تحت
      }
    });
  }

  /* ── Lines (الخطوط الواصلة بين الجسيمات القريبة) ────── */
  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
          const alpha = (1 - dist/120) * 0.04;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(79,195,247,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  /* ── Grid overlay ───────────────────────────────────── */
  function drawGrid() {
    const step = 60;
    ctx.strokeStyle = 'rgba(79,195,247,0.025)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  /* ── Main loop ──────────────────────────────────────── */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // خلفية داكنة
    ctx.fillStyle = '#060610';
    ctx.fillRect(0, 0, W, H);

    drawGrid();
    drawOrbs();
    drawLines();
    drawParticles();

    requestAnimationFrame(draw);
  }

  /* ── Utils ──────────────────────────────────────────── */
  function hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ── Init ───────────────────────────────────────────── */
  window.addEventListener('resize', () => { resize(); initOrbs(); initParticles(); });
  resize();
  initOrbs();
  initParticles();
  draw();
})();
