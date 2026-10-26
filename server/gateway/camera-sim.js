/**
 * 环视相机画面合成器（仅用于模拟网关）。
 *
 * 目标不是"画得好看"，而是让远程拍照这条链路返回的图片具备真实照片的特征：
 *   · 桶形畸变（鱼眼镜头）      · 边缘暗角与色散
 *   · 单一世界坐标系（4 路视角朝向不同，但看到的是同一个停车场）
 *   · 图像内嵌时间戳与通道号（事后取证必需）
 *
 * 真实车辆上这四张图由车端 ISP 直出 JPEG，本文件不参与任何业务逻辑。
 */

const W = 640;
const H = 480;

/** 通道 → 相机在本车坐标系下的朝向（弧度，0 = 车头正前方） */
export const CHANNELS = [
  { ch: 'front', label: '前视', yaw: 0 },
  { ch: 'right', label: '右视', yaw: Math.PI / 2 },
  { ch: 'rear', label: '后视', yaw: Math.PI },
  { ch: 'left', label: '左视', yaw: -Math.PI / 2 },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 稳定伪随机：同样的坐标永远得到同样的值，避免每次渲染噪点跳动 */
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 沥青路面的微观纹理 */
function asphalt(x, y) {
  return valueNoise(x * 1.7, y * 1.7) * 0.62 + valueNoise(x * 5.3, y * 5.3) * 0.28;
}

/* ── 停车场世界 ─────────────────────────────────────────────────────
 * 统一世界坐标：单位米，原点在车头中心，+z 指向车头方向，+x 指向车身右侧。
 * 车位：沿 x 方向每 2.6m 一根分割线，沿 z 方向每 5.4m 一排。
 */
const BAY_W = 2.6;
const ROW_D = 5.4;

function parkedCarAt(wx, wz) {
  const bx = Math.round((wx - 1.3) / BAY_W);
  const bz = Math.round((wz - 5.7) / ROW_D);
  const cx = 1.3 + bx * BAY_W;
  const cz = 5.7 + bz * ROW_D;

  // 每三个车位留一个空位，画面才不会像复制粘贴
  const occupied = hash2(bx * 3 + 11, bz * 7 + 5) > 0.34;
  if (!occupied) return null;

  const dx = Math.abs(wx - cx);
  const dz = Math.abs(wz - cz);
  if (dx > 0.95 || dz > 2.3) return null;

  const tone = hash2(bx * 13 + 2, bz * 17 + 9);
  const body = [
    [186, 189, 193], [42, 48, 58], [128, 132, 138], [76, 84, 96], [163, 168, 172],
  ][Math.floor(tone * 5) % 5];

  // 车顶 / 挡风玻璃的高光带
  const glassBand = dz > 0.75 && dz < 1.55;
  if (glassBand) return [body[0] * 0.42 + 26, body[1] * 0.44 + 30, body[2] * 0.5 + 38];
  return body;
}

function groundColor(wx, wz, dist) {
  let r;
  let g;
  let b;

  const tex = asphalt(wx, wz);

  // 远侧草坪 / 路缘石
  if (Math.abs(wx) > 15.5) {
    const edge = smooth(15.5, 17, Math.abs(wx));
    const grass = 0.75 + valueNoise(wx * 3.1, wz * 3.1) * 0.5;
    r = 58 * grass;
    g = 66 * grass;
    b = 52 * grass;
    r = r * edge + 92 * (1 - edge);
    g = g * edge + 94 * (1 - edge);
    b = b * edge + 96 * (1 - edge);
  } else {
    // 沥青：底色 + 纹理 + 局部补丁（深浅不一，才像用了几年的地面）
    const patch = valueNoise(wx * 0.18 + 40, wz * 0.18) > 0.68 ? 8 : 0;
    r = 62 + tex * 22 + patch;
    g = 63 + tex * 22 + patch;
    b = 67 + tex * 23 + patch;
  }

  // 车位分割线与端线
  const lineX = Math.abs(wx - Math.round(wx / BAY_W) * BAY_W) < 0.055;
  const lineZ = Math.abs(wz - (Math.round((wz - 3) / ROW_D) * ROW_D + 3)) < 0.05;
  if (Math.abs(wx) <= 15.5 && (lineX || lineZ) && wz > 1.5 && wz < 34) {
    const wear = 0.72 + asphalt(wx * 9, wz * 9) * 0.4;
    r = 196 * wear;
    g = 196 * wear;
    b = 188 * wear;
  }

  // 井盖：一个深色圆形，给画面一个尺度参照
  const mhx = wx - 4.2;
  const mhz = wz - 13.5;
  if (mhx * mhx + mhz * mhz < 0.36) {
    r = 54;
    g = 55;
    b = 57;
  }

  // 停放车辆
  const car = parkedCarAt(wx, wz);
  if (car) {
    r = car[0];
    g = car[1];
    b = car[2];
  }

  // 空气透视：越远越糊、越淡
  const haze = 1 - Math.exp(-dist * 0.028);
  r = r * (1 - haze) + 176 * haze;
  g = g * (1 - haze) + 182 * haze;
  b = b * (1 - haze) + 190 * haze;

  return [r, g, b];
}

function skyColor(pu, pv, yaw) {
  // pv < 0 是天空侧；yaw 让四路相机的天光方向略有差异
  const t = clamp01((-pv + 0.15) * 1.5);
  let r = 198 - t * 92;
  let g = 205 - t * 82;
  let b = 208 - t * 62;

  // 夕阳方向（车头右侧）
  const sunX = 0.62 * Math.cos(yaw) - 0.22;
  const sunY = -0.34;
  const d = Math.hypot(pu - sunX, (pv - sunY) * 0.8);
  const glow = Math.exp(-d * d * 9) * 0.85;
  r += glow * 70;
  g += glow * 56;
  b += glow * 34;

  // 远处树线：贴在地平线上的一条深色噪波带
  const bandY = -0.02;
  if (pv < bandY && pv > bandY - 0.075) {
    const h = valueNoise(pu * 9 + 3, yaw * 4) * 0.05;
    if (Math.abs(pv - bandY) < 0.05 - h) {
      const k = 0.55 + valueNoise(pu * 22, 1.7) * 0.35;
      r = 62 * k;
      g = 74 * k;
      b = 60 * k;
    }
  }
  return [r, g, b];
}

/* ── 5×7 点阵字体：只包含时间戳与通道标签需要的字符 ───────────────── */
const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
};

function drawText(rgba, text, x0, y0, scale, alpha) {
  let cx = x0;
  for (const chr of text) {
    const glyph = FONT[chr] ?? FONT[' '];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = cx + gx * scale + sx;
            const y = y0 + gy * scale + sy;
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            const i = (y * W + x) * 4;
            rgba[i] = rgba[i] * (1 - alpha) + 245 * alpha;
            rgba[i + 1] = rgba[i + 1] * (1 - alpha) + 245 * alpha;
            rgba[i + 2] = rgba[i + 2] * (1 - alpha) + 240 * alpha;
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function stampTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ── 单帧渲染 ─────────────────────────────────────────────────────── */

/**
 * @param {'front'|'rear'|'left'|'right'} channel
 * @param {number} capturedAt 图像内嵌时间戳
 * @param {number} seed 每张照片的细微差异（噪点、曝光）
 */
export function renderFrame(channel, capturedAt, seed = 0) {
  const meta = CHANNELS.find((c) => c.ch === channel) ?? CHANNELS[0];
  const yaw = meta.yaw;

  const rgba = new Uint8Array(W * H * 4);
  const cx = W / 2;
  const cy = H * 0.5;
  const R = H * 0.62; // 镜头成像圆半径

  const exposure = 0.97 + (hash2(seed, 3.3) - 0.5) * 0.06;
  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      // 1) 到成像中心的归一化半径
      const u = (x - cx) / R;
      const v = (y - cy) / R;
      const rr = Math.hypot(u, v);

      // 2) 成像圆外：镜头外圈是黑的
      if (rr > 1) {
        rgba[i] = 4; rgba[i + 1] = 5; rgba[i + 2] = 7; rgba[i + 3] = 255;
        continue;
      }

      // 3) 桶形畸变：把像面上的像素反算回理想针孔坐标
      const theta = rr * 1.28;
      const s = Math.tan(Math.min(theta, 1.5)) / Math.max(rr, 1e-6);
      const pu = u * s;
      const pv = v * s;

      let r;
      let g;
      let b;

      const horizon = 0.16;
      if (pv <= horizon) {
        [r, g, b] = skyColor(pu, pv, yaw);
      } else {
        const dv = pv - horizon;
        // 针孔投影：地面高度 1.35m，z = h / dv
        const dist = Math.min(1.35 / dv, 90);
        const wx = pu * dist;
        const wz = dist;
        // 按相机朝向旋转到世界坐标 —— 四路相机看到的是同一个停车场
        const gx = wx * cosA - wz * sinA;
        const gz = wx * sinA + wz * cosA;
        [r, g, b] = groundColor(gx, gz, dist);
      }

      // 4) 边缘暗角 + 镜头色散
      const vig = 1 - smooth(0.55, 1.0, rr) * 0.92;
      r *= vig;
      g *= vig;
      b *= vig;
      if (rr > 0.82) {
        const k = (rr - 0.82) * 1.6;
        r *= 1 - k * 0.10;
        b *= 1 + k * 0.16;
      }

      // 5) 传感器噪点
      const n = (hash2(x * 0.91 + seed, y * 0.87) - 0.5) * 7;
      r = r * exposure + n;
      g = g * exposure + n;
      b = b * exposure + n;

      rgba[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      rgba[i + 3] = 255;
    }
  }

  // 6) 图像内嵌信息（车端 ISP 通常会烧录通道号与时间，事后取证靠它）
  drawText(rgba, `CH${CHANNELS.indexOf(meta) + 1}`, 14, 12, 2, 0.82);
  drawText(rgba, stampTime(capturedAt), 14, H - 26, 2, 0.86);
  drawText(rgba, '360', W - 62, H - 26, 2, 0.5);

  return { width: W, height: H, rgba };
}
