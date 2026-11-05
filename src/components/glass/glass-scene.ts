// Drawing for the glass-cleaning hero: the dirty glass texture, the wiper's cleaning path,
// and the frame for a given scroll progress. Pure canvas code with no React.

export type PathPoint = { x: number; y: number; angle: number };

export type Scene = {
  width: number;
  height: number;
  ratio: number;
  dirt: HTMLCanvasElement;
  path: PathPoint[];
  blade: number;
};

/** Small seeded random generator, so the dirt looks the same after every resize. */
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paints fog, dust, smudges, water spots, drips and a soft reflection onto an offscreen canvas. */
function paintDirt(width: number, height: number, ratio: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const rand = random(1658038);
  const area = width * height;

  // Milky fog, a little heavier towards the bottom where condensation gathers.
  const fog = ctx.createLinearGradient(0, 0, 0, height);
  fog.addColorStop(0, "rgba(228, 238, 234, 0.74)");
  fog.addColorStop(1, "rgba(214, 228, 222, 0.84)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, width, height);

  // Fine grain from a small noise tile.
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const tileCtx = tile.getContext("2d")!;
  const grain = tileCtx.createImageData(96, 96);
  for (let i = 0; i < grain.data.length; i += 4) {
    const shade = 150 + rand() * 105;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = shade;
    grain.data[i + 3] = rand() * 38;
  }
  tileCtx.putImageData(grain, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, width, height);

  // Soft smudges.
  for (let i = 0; i < Math.round(area / 60000) + 8; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = (0.05 + rand() * 0.14) * Math.max(width, height);
    const smudge = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.4;
    smudge.addColorStop(0, light ? "rgba(255,255,255,0.26)" : "rgba(150,165,158,0.16)");
    smudge.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = smudge;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Dried water spots with brighter rims.
  for (let i = 0; i < Math.round(area / 9000); i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 1.5 + rand() * rand() * 9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();
  }

  // Dust specks.
  for (let i = 0; i < Math.round(area / 2500); i++) {
    ctx.fillStyle = `rgba(70, 82, 76, ${0.12 + rand() * 0.22})`;
    ctx.fillRect(rand() * width, rand() * height, 0.6 + rand() * 1.4, 0.6 + rand() * 1.4);
  }

  // Condensation drips running down.
  for (let i = 0; i < Math.round(width / 110) + 3; i++) {
    const x = rand() * width;
    const top = rand() * height * 0.6;
    const length = height * (0.12 + rand() * 0.35);
    const drip = ctx.createLinearGradient(x, top, x, top + length);
    drip.addColorStop(0, "rgba(255,255,255,0)");
    drip.addColorStop(0.7, "rgba(255,255,255,0.32)");
    drip.addColorStop(1, "rgba(255,255,255,0.55)");
    ctx.strokeStyle = drip;
    ctx.lineWidth = 1.2 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.bezierCurveTo(x + rand() * 6 - 3, top + length * 0.4, x + rand() * 8 - 4, top + length * 0.7, x + rand() * 4 - 2, top + length);
    ctx.stroke();
  }

  // A restrained diagonal reflection, as light catches the glass.
  const sheen = ctx.createLinearGradient(width * 0.1, 0, width * 0.55, height);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.55, "rgba(255,255,255,0.05)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

/**
 * The classic "S" squeegee technique: horizontal passes from top to bottom, turning at each edge.
 * Narrow screens get more, shorter passes, so the wiper stays a sensible size on phones.
 */
function buildPath(width: number, height: number, rtl: boolean) {
  const passes = Math.min(6, Math.max(3, Math.round(height / (width * 0.42))));
  const band = height / passes;
  const blade = band * 1.28;
  const radius = band / 2;
  const turnInset = Math.min(width * 0.06, blade * 0.15);
  const raw: { x: number; y: number }[] = [];

  const line = (x1: number, x2: number, y: number) => {
    const steps = Math.ceil(Math.abs(x2 - x1) / 6);
    for (let s = 0; s <= steps; s++) raw.push({ x: x1 + ((x2 - x1) * s) / steps, y });
  };
  const turn = (cx: number, cy: number, rightSide: boolean) => {
    for (let s = 1; s < 24; s++) {
      const a = -Math.PI / 2 + (Math.PI * s) / 24;
      raw.push({ x: cx + (rightSide ? 1 : -1) * Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
  };

  const left = turnInset;
  const right = width - turnInset;
  for (let i = 0; i < passes; i++) {
    const y = band * (i + 0.5);
    const goingRight = i % 2 === 0;
    const start = i === 0 ? -blade * 0.7 : goingRight ? left : right;
    const end = i === passes - 1 ? (goingRight ? width + blade * 0.9 : -blade * 0.9) : goingRight ? right : left;
    line(start, end, y);
    if (i < passes - 1) turn(end, y + radius, goingRight);
  }

  // Even spacing along the path, so the wiper moves at a steady speed.
  const lengths = [0];
  for (let i = 1; i < raw.length; i++) lengths.push(lengths[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  const total = lengths.at(-1)!;
  const count = Math.max(200, Math.round(total / 5));
  const path: PathPoint[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const target = (total * k) / count;
    while (j < lengths.length - 2 && lengths[j + 1] < target) j++;
    const span = lengths[j + 1] - lengths[j] || 1;
    const f = (target - lengths[j]) / span;
    const x = raw[j].x + (raw[j + 1].x - raw[j].x) * f;
    path.push({ x: rtl ? width - x : x, y: raw[j].y + (raw[j + 1].y - raw[j].y) * f, angle: 0 });
  }

  // Direction of travel, smoothed and unwrapped so the wiper turns instead of spinning.
  let previous = 0;
  for (let k = 0; k < path.length; k++) {
    const a = path[Math.max(0, k - 3)];
    const b = path[Math.min(path.length - 1, k + 3)];
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (k > 0) {
      while (angle - previous > Math.PI) angle -= Math.PI * 2;
      while (angle - previous < -Math.PI) angle += Math.PI * 2;
    }
    path[k].angle = angle;
    previous = angle;
  }
  return { path, blade };
}

export function createScene(width: number, height: number, ratio: number, rtl: boolean): Scene {
  const { path, blade } = buildPath(width, height, rtl);
  return { width, height, ratio, dirt: paintDirt(width, height, ratio), path, blade };
}

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Where the wiper is at a given scroll progress. */
export function wiperAt(scene: Scene, progress: number) {
  const index = Math.round(Math.min(1, Math.max(0, progress)) * (scene.path.length - 1));
  return { point: scene.path[index], index };
}

/**
 * Draws one frame from scratch: the dirty glass, minus everything the blade has already crossed.
 * Because it never depends on the previous frame, scrolling back up restores the dirt exactly.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, progress: number) {
  const { ratio, dirt, path, blade } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Whatever is left fades away at the very end, so the glass always finishes spotless.
  const remaining = 1 - smoothstep(0.9, 1, progress);
  if (remaining <= 0) return;
  ctx.globalAlpha = remaining;
  ctx.drawImage(dirt, 0, 0);
  ctx.globalAlpha = 1;

  const { index } = wiperAt(scene, progress);
  if (index < 1) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  // A feathered edge along the sides of each pass; the leading edge stays straight like a real blade.
  for (const [scale, alpha] of [
    [1.06, 0.35],
    [1, 0.65],
    [0.94, 1],
  ] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = blade * scale;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i <= index; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
