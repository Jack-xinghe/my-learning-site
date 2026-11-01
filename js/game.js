(() => {
  const { Engine, World, Bodies, Body, Events, Composite } = Matter;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const menu = document.getElementById("menu");
  const result = document.getElementById("result");
  const hudLevel = document.getElementById("hudLevel");
  const hudAmmo = document.getElementById("hudAmmo");
  const hudScore = document.getElementById("hudScore");

  const SLING = {
    baseX: 230,
    baseY: WORLD.groundTop,
    forkLeft: { x: 204, y: 628 },
    forkRight: { x: 258, y: 628 },
    origin: { x: 232, y: 640 },
    maxPull: 150,
  };

  const FOX_R = 22;
  const SETTLE_SPEED = 0.42;
  const SETTLE_MS = 900;
  const MIN_FLIGHT_MS = 700;

  const state = {
    screen: "menu",
    levelId: "easy",
    engine: null,
    foxesLeft: 0,
    score: 0,
    currentFox: null,
    dragging: false,
    pull: null,
    phase: "idle",
    flightAt: 0,
    settledAt: 0,
    particles: [],
    shake: 0,
    ended: false,
    time: 0,
  };

  function ui(screen) {
    state.screen = screen;
    menu.hidden = screen !== "menu";
    result.hidden = screen !== "result";
    hud.hidden = screen === "menu";
  }

  function eventToWorld(event) {
    const point = event.touches ? event.touches[0] || event.changedTouches[0] : event;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((point.clientX - rect.left) * WORLD.width) / rect.width,
      y: ((point.clientY - rect.top) * WORLD.height) / rect.height,
    };
  }

  function clampPull(point) {
    const dx = point.x - SLING.origin.x;
    const dy = point.y - SLING.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= SLING.maxPull) return { x: point.x, y: point.y };
    const scale = SLING.maxPull / dist;
    return { x: SLING.origin.x + dx * scale, y: SLING.origin.y + dy * scale };
  }

  function makeEngine() {
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = BALLISTICS.gravityY;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    const ground = Bodies.rectangle(WORLD.width / 2, WORLD.groundTop + 70, WORLD.width * 2, 140, {
      isStatic: true,
      friction: 0.9,
      label: "ground",
    });
    const wall = Bodies.rectangle(-40, 450, 80, 1200, { isStatic: true, label: "wall" });
    World.add(engine.world, [ground, wall]);
    Events.on(engine, "collisionStart", onCollision);
    return engine;
  }

  function addLevelBodies(level) {
    level.items.forEach((item) => {
      if (item.type === "block") {
        const mat = MATERIALS[item.material];
        const body = Bodies.rectangle(item.x, item.y, item.w, item.h, {
          angle: item.angle,
          density: mat.density,
          friction: mat.friction,
          restitution: mat.restitution,
          chamfer: { radius: 4 },
          label: "block",
        });
        body.game = {
          type: "block",
          material: item.material,
          hp: mat.hp,
          maxHp: mat.hp,
          w: item.w,
          h: item.h,
        };
        World.add(state.engine.world, body);
      } else {
        const body = Bodies.circle(item.x, item.y, item.r, {
          density: 0.0011,
          friction: 0.4,
          restitution: 0.18,
          label: "raccoon",
        });
        body.game = { type: "raccoon", r: item.r, hp: 18, maxHp: 18 };
        World.add(state.engine.world, body);
      }
    });
  }

  function spawnFox() {
    state.currentFox = null;
    state.phase = "aim";
    state.dragging = false;
    state.pull = { x: SLING.origin.x, y: SLING.origin.y };
  }

  function startLevel(levelId) {
    if (state.engine) {
      Events.off(state.engine, "collisionStart", onCollision);
      World.clear(state.engine.world, false);
      Engine.clear(state.engine);
    }
    const level = LEVELS[levelId];
    state.levelId = levelId;
    state.engine = makeEngine();
    state.foxesLeft = level.foxes;
    state.score = 0;
    state.shotsFired = 0;
    state.particles = [];
    state.shake = 0;
    state.ended = false;
    state.currentFox = null;
    addLevelBodies(level);
    spawnFox();
    hudLevel.textContent = `${level.difficulty} · ${level.name}`;
    refreshHud();
    ui("play");
  }

  function refreshHud() {
    hudAmmo.textContent = `狐狸 × ${state.foxesLeft}`;
    hudScore.textContent = String(state.score);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.4 + Math.random() * 4;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 1,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  function removeBody(body, points, color) {
    if (!body.game || body.game.gone) return;
    body.game.gone = true;
    burst(body.position.x, body.position.y, color, 14);
    state.score += points;
    state.shake = Math.min(12, state.shake + 5);
    World.remove(state.engine.world, body);
    refreshHud();
  }

  function damage(body, amount) {
    if (!body.game || body.game.gone) return;
    body.game.hp -= amount;
    Body.set(body, { sleepThreshold: 20 });
    if (body.game.type === "block") {
      if (body.game.material === "wood") GameAudio.wood();
      if (body.game.material === "ice") GameAudio.ice();
      if (body.game.material === "stone") GameAudio.stone();
      if (body.game.hp <= 0) {
        const worth = body.game.material === "stone" ? 500 : body.game.material === "wood" ? 300 : 200;
        const color = body.game.material === "ice" ? "#b9e7f5" : body.game.material === "stone" ? "#8b8d92" : "#c9843c";
        removeBody(body, worth, color);
      }
    } else if (body.game.type === "raccoon" && body.game.hp <= 0) {
      GameAudio.pop();
      removeBody(body, 5000, "#8b8884");
    }
  }

  function onCollision(event) {
    event.pairs.forEach((pair) => {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (!state.shotsFired) return;
      const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (rel < 4) return;
      const hit = (body, other) => {
        if (!body.game) return;
        const bonus = other.label === "fox" ? 1.8 : other.label === "block" && other.speed > 3 ? 1.3 : 1;
        if (body.game.type === "block") {
          const toughness = body.game.material === "stone" ? 0.55 : body.game.material === "wood" ? 1 : 1.7;
          damage(body, rel * 4.2 * toughness * bonus);
        }
        if (body.game.type === "raccoon") {
          damage(body, rel * 5.2 * bonus);
        }
      };
      hit(a, b);
      hit(b, a);
    });
  }

  function living(type) {
    return Composite.allBodies(state.engine.world).filter((b) => b.game && b.game.type === type && !b.game.gone);
  }

  function worldSettled() {
    return Composite.allBodies(state.engine.world).every((body) => {
      if (body.isStatic) return true;
      return body.speed < SETTLE_SPEED && Math.abs(body.angularVelocity) < 0.08;
    });
  }

  function finish(won) {
    if (state.ended) return;
    state.ended = true;
    state.phase = "done";
    const level = LEVELS[state.levelId];
    if (won) {
      state.score += state.foxesLeft * 10000;
      const leftover = state.foxesLeft;
      let stars = 1;
      if (leftover >= level.starFoxes[0]) stars = 2;
      if (leftover >= level.starFoxes[1]) stars = 3;
      document.getElementById("resultEyebrow").textContent = "过关";
      document.getElementById("resultTitle").textContent = "坚果保住了";
      document.getElementById("resultStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
      document.getElementById("resultNote").textContent =
        leftover > 0 ? `还剩 ${leftover} 只狐狸，仓库清干净了。` : "最后一只狐狸搞定了全部浣熊。";
      document.getElementById("btnNext").hidden = state.levelId === "medium";
      GameAudio.win();
    } else {
      document.getElementById("resultEyebrow").textContent = "没过";
      document.getElementById("resultTitle").textContent = "浣熊还在偷粮";
      document.getElementById("resultStars").textContent = "☆☆☆";
      document.getElementById("resultNote").textContent = level.hint;
      document.getElementById("btnNext").hidden = true;
      GameAudio.lose();
    }
    document.getElementById("resultScore").textContent = `${state.score} 分`;
    refreshHud();
    ui("result");
  }

  function afterShot() {
    if (living("raccoon").length === 0) {
      finish(true);
      return;
    }
    if (state.foxesLeft <= 0) {
      finish(false);
      return;
    }
    spawnFox();
  }

  function launchFox() {
    if (state.phase !== "aim") return;
    const pull = state.pull || SLING.origin;
    const shot = BALLISTICS.vector(SLING.origin, pull);
    if (shot.dist < 48) {
      state.pull = { ...SLING.origin };
      return;
    }
    const fox = Bodies.circle(pull.x, pull.y, FOX_R, {
      density: 0.004,
      friction: 0.3,
      restitution: 0.35,
      frictionAir: BALLISTICS.air,
      label: "fox",
    });
    fox.game = { type: "fox", r: FOX_R };
    Body.setVelocity(fox, { x: shot.x, y: shot.y });
    World.add(state.engine.world, fox);
    state.currentFox = fox;
    state.shotsFired += 1;
    state.phase = "flight";
    state.flightAt = performance.now();
    state.settledAt = 0;
    state.foxesLeft -= 1;
    refreshHud();
    GameAudio.launch();
  }

  function updateParticles() {
    state.particles = state.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= 0.03;
      return p.life > 0;
    });
  }

  function cullFallen() {
    Composite.allBodies(state.engine.world).forEach((body) => {
      if (!body.game || body.game.gone) return;
      if (body.position.y > WORLD.height + 80 || body.position.x > WORLD.width + 160) {
        if (body.game.type === "raccoon") {
          GameAudio.pop();
          removeBody(body, 5000, "#8b8884");
        } else if (body.game.type === "block") {
          removeBody(body, 100, "#c9843c");
        } else if (body.game.type === "fox" && state.phase === "flight") {
          World.remove(state.engine.world, body);
        }
      }
    });
  }

  function tick(now) {
    state.time = now / 1000;
    if (state.engine && state.screen !== "menu") {
      Engine.update(state.engine, 1000 / 60);
      cullFallen();
      updateParticles();
      state.shake *= 0.86;

      if (state.phase === "flight") {
        const flying = state.currentFox && !state.currentFox.game.gone;
        const longEnough = now - state.flightAt > MIN_FLIGHT_MS;
        if (longEnough && worldSettled()) {
          if (!state.settledAt) state.settledAt = now;
          if (now - state.settledAt > SETTLE_MS) afterShot();
        } else {
          state.settledAt = 0;
        }
        if (flying && now - state.flightAt > 8000) afterShot();
      }
    }
    render();
    requestAnimationFrame(tick);
  }

  function render() {
    const dx = (Math.random() - 0.5) * state.shake;
    const dy = (Math.random() - 0.5) * state.shake;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.translate(dx, dy);
    Draw.background(ctx, WORLD.width, WORLD.height, state.time);
    Draw.ground(ctx, WORLD.width, WORLD.groundTop);
    Draw.slingshot(ctx, SLING, false);

    const hold = state.phase === "aim" ? state.pull || SLING.origin : SLING.origin;
    const showArc = state.phase === "aim" && BALLISTICS.vector(SLING.origin, hold).dist > 24;
    if (state.phase === "aim") Draw.bands(ctx, SLING, hold);
    if (showArc) Draw.aimDots(ctx, BALLISTICS.arc(hold).dots);

    if (state.engine) {
      const bodies = Composite.allBodies(state.engine.world);
      bodies.forEach((body) => {
        if (!body.game || body.game.gone) return;
        if (body.game.type === "block") Draw.block(ctx, body);
        if (body.game.type === "raccoon") Draw.raccoon(ctx, body.position.x, body.position.y, body.game.r, body.angle);
        if (body.game.type === "fox" && (state.phase !== "aim" || body !== state.currentFox)) {
          Draw.fox(ctx, body.position.x, body.position.y, body.game.r, body.angle);
        }
      });
    }

    if (state.phase === "aim") {
      Draw.fox(ctx, hold.x, hold.y, FOX_R, 0);
    }
    Draw.slingshot(ctx, SLING, true);
    if (state.phase === "aim") Draw.bands(ctx, SLING, hold);
    Draw.waitingFoxes(ctx, Math.max(0, state.foxesLeft - (state.phase === "aim" ? 1 : 0)), WORLD.groundTop);
    Draw.particles(ctx, state.particles);
  }

  function nearSling(point) {
    const hold = state.pull || SLING.origin;
    return Math.hypot(point.x - hold.x, point.y - hold.y) < 56;
  }

  function onDown(event) {
    if (state.screen !== "play" || state.phase !== "aim") return;
    const point = eventToWorld(event);
    if (!nearSling(point)) return;
    event.preventDefault();
    state.dragging = true;
    state.pull = clampPull(point);
    GameAudio.unlock();
    GameAudio.pull();
  }

  function onMove(event) {
    if (!state.dragging) return;
    event.preventDefault();
    state.pull = clampPull(eventToWorld(event));
  }

  function onUp(event) {
    if (!state.dragging) return;
    event.preventDefault();
    state.dragging = false;
    if (event.changedTouches || event.clientX != null) {
      try {
        state.pull = clampPull(eventToWorld(event));
      } catch (err) {
        /* keep last pull */
      }
    }
    launchFox();
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp, { passive: false });

  document.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      GameAudio.unlock();
      startLevel(button.dataset.level);
    });
  });
  document.getElementById("btnRestart").addEventListener("click", () => startLevel(state.levelId));
  document.getElementById("btnMenu").addEventListener("click", () => ui("menu"));
  document.getElementById("btnAgain").addEventListener("click", () => startLevel(state.levelId));
  document.getElementById("btnBack").addEventListener("click", () => ui("menu"));
  document.getElementById("btnNext").addEventListener("click", () => startLevel("medium"));

  ui("menu");
  requestAnimationFrame(tick);
})();
