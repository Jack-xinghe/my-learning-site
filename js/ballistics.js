const BALLISTICS = {
  power: 0.18,
  loft: 0.65,
  air: 0.01,
  gravityY: 1.05,

  vector(origin, pull) {
    const dx = origin.x - pull.x;
    const dy = origin.y - pull.y;
    return {
      x: dx * this.power,
      y: dy * this.power * this.loft,
      dist: Math.hypot(dx, dy),
    };
  },

  arc(pull, steps) {
    const origin = { x: 232, y: 640 };
    const v = this.vector(origin, pull);
    const delta = 1000 / 60;
    const gravity = this.gravityY * 0.001 * delta * delta;
    const drag = 1 - this.air;
    let x = pull.x;
    let y = pull.y;
    let vx = v.x;
    let vy = v.y;
    const dots = [];
    const count = steps || 80;
    for (let i = 1; i <= count; i += 1) {
      vx *= drag;
      vy = vy * drag + gravity;
      x += vx;
      y += vy;
      if (i % 4 === 0) dots.push({ x, y });
      if (y > 760) break;
    }
    return { velocity: v, dots, end: { x, y } };
  },
};
