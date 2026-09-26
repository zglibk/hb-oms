<!--
  首页横幅烟花（法定假期期间由父组件挂载）：Canvas 粒子系统。
  火箭带火星尾迹升空 → 到顶炸开（彩色闪光）→ 火星受重力下坠、空气阻尼减速、拖尾渐隐、临熄闪烁 / 爆裂。
  每颗火星 = 发光光晕贴图 + 近白亮芯，色相全部满饱和，浅色横幅上也够艳。
  炸法：彩虹牡丹（按方向变色）、双色牡丹、变色菊（金→玫红）、爆裂金柳、环形。
  纯装饰：不接收鼠标；页面隐藏时 rAF 自然停；「减少动态效果」下不放；卸载即停。
-->
<template>
  <canvas ref="canvasRef" class="fw-canvas" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const canvasRef = ref<HTMLCanvasElement>();

interface Particle {
  x: number; y: number; vx: number; vy: number;
  /** 1 → 0 */
  life: number; decay: number;
  hue: number;
  /** 整个寿命里色相漂移的总量（变色菊用），0 = 不变色 */
  hueShift: number;
  light: number;
  size: number;
  drag: number;
  gravity: number;
  /** 最近几帧的位置，画拖尾 */
  trail: Array<[number, number]>;
  trailLen: number;
  twinkle: boolean;
  /** 熄灭前炸出几粒白金色碎闪（爆裂金柳） */
  crackle: boolean;
}
interface Rocket {
  x: number; y: number; vx: number; vy: number;
  targetY: number;
  hue: number;
  trail: Array<[number, number]>;
}

/** 满饱和的艳色相：玫红 / 大红 / 橙 / 金 / 翠绿 / 青 / 宝蓝 / 紫 / 品红 */
const HUES = [340, 0, 22, 45, 140, 185, 215, 270, 300];
const MAX_PARTICLES = 800;

let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let w = 0;
let h = 0;
let particles: Particle[] = [];
let rockets: Rocket[] = [];
const flashes: Array<{ x: number; y: number; life: number; hue: number }> = [];
let nextLaunch = 0;
let last = 0;
let ro: ResizeObserver | null = null;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * 发光光晕贴图：按「色相(6°一档) + 亮度」缓存一张 32px 径向渐变。
 * 用 drawImage 贴图代替 shadowBlur——后者每画一颗都要做一次模糊，几百颗火星会明显掉帧。
 */
const spriteCache = new Map<string, HTMLCanvasElement>();
function glowSprite(hue: number, light: number): HTMLCanvasElement {
  const hk = ((Math.round(hue / 6) * 6) % 360 + 360) % 360;
  const key = `${hk}|${light}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, `hsla(${hk}, 100%, ${Math.min(96, light + 36)}%, 1)`);
  grd.addColorStop(0.22, `hsla(${hk}, 100%, ${light + 8}%, 0.95)`);
  grd.addColorStop(0.5, `hsla(${hk}, 100%, ${light}%, 0.4)`);
  grd.addColorStop(1, `hsla(${hk}, 100%, ${light}%, 0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  spriteCache.set(key, c);
  return c;
}

function resize() {
  const c = canvasRef.value;
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = c.clientWidth;
  h = c.clientHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const G = 0.045;
function launch() {
  // 目标高度落在横幅上半部；速度按「刚好升到目标高度」反推（v² = 2gh）
  const targetY = rand(h * 0.12, h * 0.42);
  const rise = h + 6 - targetY;
  rockets.push({
    x: rand(w * 0.08, w * 0.92),
    y: h + 6,
    vx: rand(-0.35, 0.35),
    vy: -Math.sqrt(2 * G * rise) * rand(1.0, 1.06),
    targetY,
    hue: pick(HUES),
    trail: [],
  });
}

type Spark = Omit<Particle, 'life' | 'trail' | 'x' | 'y'>;
function add(x: number, y: number, p: Spark) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({ ...p, x, y, life: 1, trail: [] });
}

function explode(r: Rocket) {
  const scale = Math.max(0.8, h / 70); // 横幅越高炸得越大；83px 横幅时炸开直径约为横幅高度
  const base = r.hue;
  const kind = Math.random();
  const burst = (n: number, speed: (i: number) => number, mk: (a: number, i: number) => Partial<Spark>) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = speed(i) * scale;
      add(r.x, r.y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.011, 0.018),
        hue: base, hueShift: 0, light: 55, size: rand(1.3, 1.9), drag: 0.968, gravity: 0.022,
        trailLen: 5, twinkle: Math.random() < 0.3, crackle: false,
        ...mk(a, i),
      });
    }
  };
  // 速度开方分布：火星均匀铺满球面，不挤在外圈
  const sphere = () => Math.sqrt(Math.random()) * 1.6;

  if (kind < 0.24) {
    // 彩虹牡丹：色相随方向转一整圈
    burst(100, sphere, (a) => ({ hue: base + (a * 180) / Math.PI, light: 56 }));
  } else if (kind < 0.44) {
    // 双色牡丹：主色 + 撞色
    const second = (base + 150 + rand(-20, 20)) % 360;
    burst(95, sphere, () => (Math.random() < 0.65 ? { hue: base + rand(-8, 8) } : { hue: second }));
  } else if (kind < 0.64) {
    // 变色菊：金色长拖尾，熄灭前变成玫红 / 紫
    burst(85, () => rand(0.9, 1.6), () => ({
      hue: 45, hueShift: pick([-80, -100, 230]), light: 57, trailLen: 8, decay: rand(0.009, 0.013), drag: 0.972,
    }));
  } else if (kind < 0.84) {
    // 爆裂金柳：慢熄、长拖尾、下坠，末了噼啪炸出白金碎闪
    burst(75, () => rand(0.45, 1.4), () => ({
      hue: rand(38, 48), light: 58, trailLen: 10, decay: rand(0.006, 0.009), drag: 0.975, gravity: 0.03,
      twinkle: true, crackle: Math.random() < 0.5,
    }));
  } else {
    // 环形 + 撞色内芯
    const tilt = rand(0.45, 1);
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      const s = 1.4 * scale;
      add(r.x, r.y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s * tilt, decay: rand(0.013, 0.016),
        hue: base, hueShift: 0, light: 55, size: 1.7, drag: 0.972, gravity: 0.02, trailLen: 5, twinkle: false, crackle: false });
    }
    burst(24, () => rand(0.2, 0.6), () => ({ hue: (base + 180) % 360, light: 62, decay: 0.02, trailLen: 3, twinkle: true }));
  }
  flashes.push({ x: r.x, y: r.y, life: 1, hue: base });
}

function frame(ts: number) {
  raf = requestAnimationFrame(frame);
  if (!ctx) return;
  // 以 60fps 为 1 个时间单位；切回标签页时的大间隔截断，免得粒子瞬移
  const dt = last ? Math.min((ts - last) / 16.667, 3) : 1;
  last = ts;

  if (ts >= nextLaunch) {
    launch();
    if (Math.random() < 0.35) launch(); // 偶尔两发齐放
    nextLaunch = ts + rand(650, 1500);
  }

  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';

  // 爆点闪光：带颜色的大光团
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    const rad = 26 * (1.15 - f.life) + 6;
    const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
    grd.addColorStop(0, `hsla(${f.hue}, 100%, 96%, ${f.life})`);
    grd.addColorStop(0.35, `hsla(${f.hue}, 100%, 65%, ${0.55 * f.life})`);
    grd.addColorStop(1, `hsla(${f.hue}, 100%, 60%, 0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
    ctx.fill();
    f.life -= 0.08 * dt;
    if (f.life <= 0) flashes.splice(i, 1);
  }

  // 火箭：减速上升，身后甩火星
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.trail.push([r.x, r.y]);
    if (r.trail.length > 8) r.trail.shift();
    r.vy += G * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (Math.random() < 0.7) {
      add(r.x, r.y, { vx: rand(-0.25, 0.25), vy: rand(0.1, 0.6), decay: rand(0.05, 0.08), hue: rand(30, 48), hueShift: 0,
        light: 60, size: 0.9, drag: 0.94, gravity: 0.02, trailLen: 0, twinkle: false, crackle: false });
    }
    drawTrail(r.trail, r.hue, 60, 1.5, 0.9);
    const s = glowSprite(r.hue, 60);
    ctx.drawImage(s, r.x - 6, r.y - 6, 12, 12);
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    if (r.vy >= -0.25 || r.y <= r.targetY) {
      explode(r);
      rockets.splice(i, 1);
    }
  }

  // 火星：阻尼 + 重力，拖尾渐隐，临熄闪烁 / 爆裂
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.trailLen) {
      p.trail.push([p.x, p.y]);
      if (p.trail.length > p.trailLen) p.trail.shift();
    }
    const drag = Math.pow(p.drag, dt);
    p.vx *= drag;
    p.vy = p.vy * drag + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0 || p.y > h + 20) {
      if (p.crackle && p.life <= 0) {
        for (let k = 0; k < 4; k++) {
          const a = rand(0, Math.PI * 2);
          add(p.x, p.y, { vx: Math.cos(a) * rand(0.4, 0.9), vy: Math.sin(a) * rand(0.4, 0.9), decay: rand(0.07, 0.11),
            hue: 50, hueShift: 0, light: 72, size: 1.1, drag: 0.9, gravity: 0.01, trailLen: 0, twinkle: true, crackle: false });
        }
      }
      particles.splice(i, 1);
      continue;
    }
    const hue = p.hue + p.hueShift * (1 - p.life);
    let alpha = Math.min(1, p.life * 1.8);
    if (p.twinkle && p.life < 0.45 && Math.random() < 0.35) alpha *= 0.12;
    if (p.trail.length > 1) drawTrail(p.trail, hue, p.light, p.size * 0.9, alpha * 0.7);
    // 光晕贴图 + 近白亮芯
    const R = p.size * (1.6 + p.life * 1.6) * 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(hue, p.light), p.x - R, p.y - R, R * 2, R * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 88%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 拖尾：从尾到头逐段加粗加亮 */
function drawTrail(pts: Array<[number, number]>, hue: number, light: number, width: number, alpha: number) {
  if (!ctx || pts.length < 2) return;
  ctx.strokeStyle = `hsl(${hue}, 100%, ${light}%)`;
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length;
    ctx.globalAlpha = alpha * k;
    ctx.lineWidth = width * (0.4 + 0.6 * k);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = canvasRef.value;
  if (!c) return;
  ctx = c.getContext('2d');
  resize();
  ro = new ResizeObserver(resize);
  ro.observe(c);
  raf = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  particles = [];
  rockets = [];
  flashes.length = 0;
  spriteCache.clear();
  ctx = null;
});
</script>

<style scoped>
.fw-canvas {
  display: block;
  pointer-events: none;
}
</style>
