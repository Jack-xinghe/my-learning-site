const WORLD = {
  width: 1600,
  height: 900,
  groundTop: 780,
};

const MATERIALS = {
  wood: { hp: 32, density: 0.0008, friction: 0.55, restitution: 0.05 },
  ice: { hp: 12, density: 0.0004, friction: 0.04, restitution: 0.02 },
  stone: { hp: 86, density: 0.0022, friction: 0.8, restitution: 0.01 },
};

function block(material, x, bottom, w, h) {
  return {
    type: "block",
    material,
    x,
    y: bottom - h / 2,
    w,
    h,
    angle: 0,
  };
}

function raccoon(x, bottom, r) {
  const radius = r || 20;
  return {
    type: "raccoon",
    x,
    y: bottom - radius,
    r: radius,
  };
}

function hut(cx, ground, opts) {
  const postW = opts.postW || 36;
  const postH = opts.postH || 118;
  const span = opts.span || 168;
  const baseH = 24;
  const beamH = 22;
  const roofH = 24;
  const gap = 3;
  const baseBottom = ground;
  const postBottom = baseBottom - baseH - gap;
  const beamBottom = postBottom - postH - gap;
  const roofBottom = beamBottom - beamH - gap;
  const beamMat = opts.beam || "ice";
  return [
    block(opts.base || "wood", cx, baseBottom, span + 36, baseH),
    block(opts.post || "wood", cx - span / 2, postBottom, postW, postH),
    block(opts.post || "wood", cx + span / 2, postBottom, postW, postH),
    block(beamMat, cx, beamBottom, span - 8, beamH),
    block(opts.roof || "wood", cx, roofBottom, span + 48, roofH),
    raccoon(cx, postBottom - 2, opts.innerR || 20),
    raccoon(cx, roofBottom - roofH - 2, opts.topR || 18),
  ];
}

const LEVELS = {
  easy: {
    id: "easy",
    name: "林边小仓",
    difficulty: "简单",
    foxes: 4,
    hint: "往左下方拉开再松手，狐狸会落到木屋前面。",
    starFoxes: [1, 2],
    items: [
      ...hut(990, WORLD.groundTop, { span: 220, postH: 156, beam: "ice", postW: 44 }),
      block("wood", 1210, WORLD.groundTop, 90, 52),
      raccoon(1210, WORLD.groundTop - 52, 20),
    ],
  },
  medium: {
    id: "medium",
    name: "双塔仓库",
    difficulty: "中等",
    foxes: 3,
    hint: "石头要多撞几次。先打木柱和冰块。",
    starFoxes: [1, 2],
    items: [
      ...hut(930, WORLD.groundTop, { span: 160, postH: 100, beam: "ice", base: "wood", postW: 40 }),
      ...hut(1160, WORLD.groundTop, { span: 156, postH: 128, beam: "wood", base: "stone", post: "wood", postW: 40 }),
      block("stone", 1360, WORLD.groundTop, 108, 36),
      block("wood", 1360, WORLD.groundTop - 40, 32, 86),
      block("ice", 1360, WORLD.groundTop - 130, 96, 22),
      raccoon(1360, WORLD.groundTop - 156, 18),
    ],
  },
};
