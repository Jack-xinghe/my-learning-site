const Draw = {
  clouds: [
    { x: 180, y: 110, s: 1 },
    { x: 520, y: 70, s: 0.8 },
    { x: 890, y: 130, s: 1.15 },
    { x: 1280, y: 80, s: 0.9 },
  ],

  background(ctx, w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#7ec8e3");
    sky.addColorStop(0.45, "#b7e4f2");
    sky.addColorStop(0.72, "#f3d7a2");
    sky.addColorStop(1, "#f0c27a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.clouds.forEach((cloud, i) => {
      const x = (cloud.x + t * (6 + i)) % (w + 200) - 100;
      this.cloud(ctx, x, cloud.y, cloud.s);
    });

    ctx.fillStyle = "#6bbf73";
    ctx.beginPath();
    ctx.ellipse(260, 780, 340, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4ea35c";
    ctx.beginPath();
    ctx.ellipse(980, 800, 420, 110, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d8a4d";
    ctx.beginPath();
    ctx.ellipse(1480, 790, 280, 100, 0, 0, Math.PI * 2);
    ctx.fill();

    this.tree(ctx, 70, 780, 1.1);
    this.tree(ctx, 430, 780, 0.75);
    this.tree(ctx, 1500, 780, 0.95);
  },

  cloud(ctx, x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.beginPath();
    ctx.ellipse(x, y, 46 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 28 * s, y - 10 * s, 30 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 54 * s, y + 2 * s, 36 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  tree(ctx, x, ground, s) {
    ctx.fillStyle = "#6b3f22";
    ctx.fillRect(x - 8 * s, ground - 90 * s, 16 * s, 90 * s);
    ctx.fillStyle = "#2f6d3a";
    ctx.beginPath();
    ctx.arc(x, ground - 110 * s, 38 * s, 0, Math.PI * 2);
    ctx.arc(x - 26 * s, ground - 86 * s, 24 * s, 0, Math.PI * 2);
    ctx.arc(x + 26 * s, ground - 86 * s, 24 * s, 0, Math.PI * 2);
    ctx.fill();
  },

  ground(ctx, w, groundTop) {
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(0, groundTop, w, 900 - groundTop);
    ctx.fillStyle = "#3f8f4a";
    ctx.fillRect(0, groundTop, w, 22);
    ctx.fillStyle = "#67b35a";
    for (let x = 0; x < w; x += 18) {
      ctx.fillRect(x, groundTop - 6, 8, 10);
    }
  },

  slingshot(ctx, sling, foxInFront) {
    const { baseX, baseY, forkLeft, forkRight } = sling;
    ctx.strokeStyle = "#6b3a1f";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(forkLeft.x, forkLeft.y);
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(forkRight.x, forkRight.y);
    ctx.stroke();
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 10;
    ctx.stroke();
    if (foxInFront) return;
    ctx.fillStyle = "#5a3018";
    ctx.fillRect(baseX - 10, forkLeft.y + 20, 20, baseY - forkLeft.y - 20);
  },

  bands(ctx, sling, hold) {
    ctx.strokeStyle = "#6b2430";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(sling.forkLeft.x, sling.forkLeft.y);
    ctx.lineTo(hold.x, hold.y);
    ctx.lineTo(sling.forkRight.x, sling.forkRight.y);
    ctx.stroke();
    ctx.strokeStyle = "#c45b4a";
    ctx.lineWidth = 3;
    ctx.stroke();
  },

  aimDots(ctx, dots) {
    dots.forEach((dot, i) => {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, i % 2 === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(42,27,18,0.45)";
      ctx.stroke();
    });
  },

  fox(ctx, x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.fillStyle = "#e86b1f";
    ctx.beginPath();
    ctx.ellipse(-r * 1.05, r * 0.15, r * 0.72, r * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7d7a4";
    ctx.beginPath();
    ctx.ellipse(-r * 1.35, r * 0.08, r * 0.22, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f07828";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe7c2";
    ctx.beginPath();
    ctx.ellipse(r * 0.08, r * 0.22, r * 0.55, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f07828";
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.55);
    ctx.lineTo(-r * 0.72, -r * 1.15);
    ctx.lineTo(-r * 0.05, -r * 0.75);
    ctx.closePath();
    ctx.moveTo(r * 0.42, -r * 0.55);
    ctx.lineTo(r * 0.7, -r * 1.15);
    ctx.lineTo(r * 0.02, -r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3b2416";
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.78);
    ctx.lineTo(-r * 0.66, -r * 1.05);
    ctx.lineTo(-r * 0.28, -r * 0.82);
    ctx.closePath();
    ctx.moveTo(r * 0.46, -r * 0.78);
    ctx.lineTo(r * 0.64, -r * 1.05);
    ctx.lineTo(r * 0.24, -r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2a1b12";
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.16, r * 0.035, 0, Math.PI * 2);
    ctx.arc(r * 0.32, -r * 0.16, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1b12";
    ctx.beginPath();
    ctx.ellipse(r * 0.08, r * 0.12, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  raccoon(ctx, x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.fillStyle = "#6d6a68";
    ctx.beginPath();
    ctx.ellipse(-r * 1.0, r * 0.2, r * 0.7, r * 0.28, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8d2c8";
    ctx.beginPath();
    ctx.ellipse(-r * 1.15, r * 0.2, r * 0.22, r * 0.18, -0.3, 0, Math.PI * 2);
    ctx.ellipse(-r * 0.82, r * 0.16, r * 0.16, r * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8b8884";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#efe6d8";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f2c2a";
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.08, r * 0.28, r * 0.18, -0.2, 0, Math.PI * 2);
    ctx.ellipse(r * 0.28, -r * 0.08, r * 0.28, r * 0.18, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f0e6";
    ctx.beginPath();
    ctx.arc(-r * 0.26, -r * 0.08, r * 0.12, 0, Math.PI * 2);
    ctx.arc(r * 0.26, -r * 0.08, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1a18";
    ctx.beginPath();
    ctx.arc(-r * 0.26, -r * 0.08, r * 0.06, 0, Math.PI * 2);
    ctx.arc(r * 0.26, -r * 0.08, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c97b7b";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.14, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  block(ctx, body) {
    const { material, hp, maxHp } = body.game;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    const w = body.game.w;
    const h = body.game.h;
    const hurt = hp / maxHp;
    const palette = {
      wood: ["#c9843c", "#a66a2b", "#8a531e"],
      ice: ["#b9e7f5", "#8fd3e8", "#6bb8d0"],
      stone: ["#8b8d92", "#6f7176", "#55565b"],
    }[material];
    ctx.fillStyle = hurt > 0.55 ? palette[0] : hurt > 0.3 ? palette[1] : palette[2];
    ctx.strokeStyle = "rgba(42,27,18,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 5);
    ctx.fill();
    ctx.stroke();
    if (material === "wood") {
      ctx.strokeStyle = "rgba(90,50,20,0.25)";
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 8, -h / 4);
      ctx.lineTo(w / 2 - 8, -h / 4);
      ctx.moveTo(-w / 2 + 10, h / 5);
      ctx.lineTo(w / 2 - 6, h / 5);
      ctx.stroke();
    }
    if (material === "ice") {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(-w / 5, -h / 3);
      ctx.lineTo(w / 6, h / 8);
      ctx.stroke();
    }
    ctx.restore();
  },

  waitingFoxes(ctx, count, groundTop) {
    for (let i = 0; i < count; i += 1) {
      this.fox(ctx, 70 + i * 36, groundTop - 22, 18, 0);
    }
  },

  particles(ctx, particles) {
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },
};
