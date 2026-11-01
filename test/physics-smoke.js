const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const matterCode = fs.readFileSync(path.join(__dirname, "../vendor/matter.min.js"), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(matterCode, sandbox);
const { Engine, World, Bodies, Body, Events, Composite } = sandbox.Matter;

function load(file, names) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  return vm.runInContext(`${source}\n({ ${names.join(", ")} });`, sandbox);
}

const { WORLD, MATERIALS, LEVELS } = load("js/levels.js", ["WORLD", "MATERIALS", "LEVELS"]);
const { BALLISTICS } = load("js/ballistics.js", ["BALLISTICS"]);

function build(levelId) {
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = BALLISTICS.gravityY;
  World.add(engine.world, [
    Bodies.rectangle(WORLD.width / 2, WORLD.groundTop + 70, WORLD.width * 2, 140, {
      isStatic: true,
      friction: 0.9,
    }),
  ]);
  LEVELS[levelId].items.forEach((item) => {
    if (item.type === "block") {
      const mat = MATERIALS[item.material];
      const body = Bodies.rectangle(item.x, item.y, item.w, item.h, {
        density: mat.density,
        friction: mat.friction,
        restitution: mat.restitution,
      });
      body.game = {
        type: "block",
        material: item.material,
        hp: mat.hp,
        maxHp: mat.hp,
        x0: item.x,
        y0: item.y,
      };
      World.add(engine.world, body);
    } else {
      const body = Bodies.circle(item.x, item.y, item.r, {
        density: 0.0011,
        friction: 0.4,
        restitution: 0.18,
      });
      body.game = { type: "raccoon", hp: 18, maxHp: 18, x0: item.x, y0: item.y };
      World.add(engine.world, body);
    }
  });
  return engine;
}

function step(engine, frames) {
  for (let i = 0; i < frames; i += 1) Engine.update(engine, 1000 / 60);
}

["easy", "medium"].forEach((id) => {
  const engine = build(id);
  const raccoons = LEVELS[id].items.filter((item) => item.type === "raccoon").length;
  assert.ok(raccoons >= 3, `${id} should have several raccoons`);
  step(engine, 360);
  const bodies = Composite.allBodies(engine.world).filter((body) => body.game);
  assert.strictEqual(
    bodies.filter((body) => body.game.type === "raccoon").length,
    raccoons,
    `${id} raccoons should stay in the world`,
  );
  bodies.forEach((body) => {
    const drift = Math.hypot(body.position.x - body.game.x0, body.position.y - body.game.y0);
    assert.ok(drift < 36, `${id} ${body.game.type} drifted ${drift.toFixed(1)}px`);
  });
});

const origin = { x: 232, y: 640 };
const natural = { x: origin.x - 80, y: origin.y + 110 };
const predicted = BALLISTICS.arc(natural, 160).end;
const flight = Engine.create();
flight.gravity.y = BALLISTICS.gravityY;
World.add(flight.world, Bodies.rectangle(800, WORLD.groundTop + 70, 4000, 140, { isStatic: true }));
const shot = BALLISTICS.vector(origin, natural);
const flyer = Bodies.circle(natural.x, natural.y, 22, {
  frictionAir: BALLISTICS.air,
  density: 0.0022,
  restitution: 0.2,
});
World.add(flight.world, flyer);
Body.setVelocity(flyer, { x: shot.x, y: shot.y });
for (let i = 0; i < 180; i += 1) {
  Engine.update(flight, 1000 / 60);
  if (flyer.position.y > WORLD.groundTop - 24 && i > 8) break;
}
const miss = Math.hypot(flyer.position.x - predicted.x, flyer.position.y - predicted.y);
assert.ok(miss < 80, `aim arc should match the shot, off by ${miss.toFixed(1)}`);
assert.ok(
  flyer.position.x > 880 && flyer.position.x < 1320,
  `a low pull should reach the fort, landed at ${flyer.position.x.toFixed(0)}`,
);

const combat = build("easy");
Events.on(combat, "collisionStart", (event) => {
  event.pairs.forEach((pair) => {
    const rel = Math.hypot(
      pair.bodyA.velocity.x - pair.bodyB.velocity.x,
      pair.bodyA.velocity.y - pair.bodyB.velocity.y,
    );
    [pair.bodyA, pair.bodyB].forEach((body) => {
      if (!body.game || rel < 4) return;
      const toughness = body.game.material === "stone" ? 0.55 : body.game.material === "ice" ? 1.7 : 1;
      body.game.hp -= rel * 4.2 * (body.game.type === "raccoon" ? 1.2 : toughness);
    });
  });
});
const fox = Bodies.circle(natural.x, natural.y, 22, {
  density: 0.0024,
  frictionAir: BALLISTICS.air,
  restitution: 0.42,
});
World.add(combat.world, fox);
Body.setVelocity(fox, { x: shot.x, y: shot.y });
step(combat, 220);
const hurt = Composite.allBodies(combat.world).filter((body) => body.game && body.game.hp < body.game.maxHp);
assert.ok(hurt.length > 0, "a natural shot should damage the easy fort");

console.log(
  "physics-smoke ok",
  "land",
  Math.round(flyer.position.x),
  "hurt",
  hurt.map((body) => body.game.type || body.game.material).join(","),
);
