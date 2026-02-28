/* bg.js - Dark Glassmorphism Premium Background */
(function() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, orbs = [], particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeOrb() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: 300 + Math.random() * 500,
      color: ['#1a1a2e','#16213e','#0f3460','#1a1a3e'][Math.floor(Math.random()*4)],
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1,
      alpha: 0.1 + Math.random() * 0.4,
      vy: -0.05 - Math.random() * 0.1,
      vx: (Math.random() - 0.5) * 0.05,
      life: 0,
      maxLife: 300 + Math.random() * 400,
    };
  }

  function init() {
    orbs = [];
    particles = [];
    for (let i = 0; i < 4; i++) orbs.push(makeOrb());
    for (let i = 0; i < 60; i++) particles.push(makeParticle());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // خلفية سوداء تقريباً
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);

    // subtle gradient overlay
    const bg = ctx.createRadialGradient(W*0.5, H*0.3, 0, W*0.5, H*0.3, Math.max(W,H)*0.8);
    bg.addColorStop(0, 'rgba(20,20,40,0.6)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // orbs
    orbs.forEach(o => {
      o.phase += 0.004;
      o.x += o.vx + Math.sin(o.phase) * 0.15;
      o.y += o.vy + Math.cos(o.phase * 0.7) * 0.1;
      if (o.x < -o.r) o.x = W + o.r;
      if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r;
      if (o.y > H + o.r) o.y = -o.r;

      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, 'rgba(60,60,100,0.15)');
      g.addColorStop(0.5, 'rgba(30,30,60,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    // particles (dust)
    particles.forEach((p, i) => {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      const prog = p.life / p.maxLife;
      const fade = prog < 0.1 ? prog/0.1 : prog > 0.8 ? (1-prog)/0.2 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(180,180,220,${p.alpha * fade})`;
      ctx.fill();
      if (p.life >= p.maxLife || p.y < -5) {
        particles[i] = makeParticle();
        particles[i].y = H + 5;
      }
    });

    // subtle horizontal scanlines (very faint)
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); init(); });
  resize();
  init();
  draw();
})();
