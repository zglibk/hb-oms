import { randomBytes } from 'crypto';
import { deflateSync } from 'zlib';

type Rgba = [number, number, number, number];

const PALETTES: Array<[Rgba, Rgba]> = [
  [[43, 116, 181, 255], [69, 164, 137, 255]],
  [[74, 103, 170, 255], [154, 94, 129, 255]],
  [[45, 137, 126, 255], [132, 165, 78, 255]],
  [[171, 92, 102, 255], [197, 151, 68, 255]],
  [[70, 121, 158, 255], [117, 91, 157, 255]],
];

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(data: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const value of data) {
    crc = table[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 6 })),
    pngChunk('IEND'),
  ]);
}

function createPrng(): () => number {
  let state = randomBytes(4).readUInt32BE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function blendPixel(
  pixels: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Rgba,
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = pixelOffset(width, x, y);
  pixels[offset] = clamp(pixels[offset] * (1 - alpha) + color[0] * alpha);
  pixels[offset + 1] = clamp(
    pixels[offset + 1] * (1 - alpha) + color[1] * alpha,
  );
  pixels[offset + 2] = clamp(
    pixels[offset + 2] * (1 - alpha) + color[2] * alpha,
  );
  pixels[offset + 3] = 255;
}

function buildScene(width: number, height: number): Buffer {
  const rnd = createPrng();
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = pixelOffset(width, x, y);
      const ratio = (x / Math.max(width - 1, 1) + y / Math.max(height - 1, 1)) / 2;
      const noise = (rnd() - 0.5) * 12;
      pixels[offset] = clamp(palette[0][0] * (1 - ratio) + palette[1][0] * ratio + noise);
      pixels[offset + 1] = clamp(
        palette[0][1] * (1 - ratio) + palette[1][1] * ratio + noise,
      );
      pixels[offset + 2] = clamp(
        palette[0][2] * (1 - ratio) + palette[1][2] * ratio + noise,
      );
      pixels[offset + 3] = 255;
    }
  }

  for (let i = 0; i < 12; i++) {
    const cx = Math.floor(rnd() * width);
    const cy = Math.floor(rnd() * height);
    const radius = 8 + Math.floor(rnd() * 28);
    const alpha = 0.06 + rnd() * 0.13;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          blendPixel(pixels, width, height, x, y, [255, 255, 255, 255], alpha);
        }
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    const startX = Math.floor(rnd() * width);
    const startY = Math.floor(rnd() * height);
    const endX = Math.floor(rnd() * width);
    const endY = Math.floor(rnd() * height);
    const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY), 1);
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(startX + ((endX - startX) * step) / steps);
      const y = Math.round(startY + ((endY - startY) * step) / steps);
      blendPixel(pixels, width, height, x, y, [255, 255, 255, 255], 0.16);
      blendPixel(pixels, width, height, x + 1, y, [255, 255, 255, 255], 0.08);
    }
  }

  return pixels;
}

function isPiecePixel(x: number, y: number, size: number): boolean {
  const left = 3;
  const top = 3;
  const right = size - 11;
  const bottom = size - 4;
  const tabRadius = Math.max(6, Math.round(size * 0.16));
  const tabX = right;
  const tabY = Math.round(size * 0.4);
  const notchX = Math.round(size * 0.45);
  const notchY = top;
  const body = x >= left && x <= right && y >= top && y <= bottom;
  const tab = (x - tabX) ** 2 + (y - tabY) ** 2 <= tabRadius ** 2;
  const notch =
    y <= top + tabRadius &&
    (x - notchX) ** 2 + (y - notchY) ** 2 <= tabRadius ** 2;
  return (body || tab) && !notch;
}

/** 在背景上挖出一个与滑块同形的缺口（不生成滑块图） */
function cutHole(
  background: Buffer,
  width: number,
  height: number,
  pieceSize: number,
  gapX: number,
  gapY: number,
): void {
  for (let y = 0; y < pieceSize; y++) {
    for (let x = 0; x < pieceSize; x++) {
      if (!isPiecePixel(x, y, pieceSize)) continue;
      const sourceX = gapX + x;
      const sourceY = gapY + y;
      const edge =
        !isPiecePixel(x - 1, y, pieceSize) ||
        !isPiecePixel(x + 1, y, pieceSize) ||
        !isPiecePixel(x, y - 1, pieceSize) ||
        !isPiecePixel(x, y + 1, pieceSize);
      const alpha = edge ? 0.78 : 0.48;
      blendPixel(
        background,
        width,
        height,
        sourceX,
        sourceY,
        edge ? [245, 248, 252, 255] : [0, 0, 0, 255],
        alpha,
      );
    }
  }
}

/** 从原图裁出滑块拼图块，同时在背景挖真缺口 */
function cutPieceAndHole(
  scene: Buffer,
  background: Buffer,
  piece: Buffer,
  width: number,
  height: number,
  pieceSize: number,
  gapX: number,
  gapY: number,
): void {
  for (let y = 0; y < pieceSize; y++) {
    for (let x = 0; x < pieceSize; x++) {
      if (!isPiecePixel(x, y, pieceSize)) continue;
      const sourceX = gapX + x;
      const sourceY = gapY + y;
      const sourceOffset = pixelOffset(width, sourceX, sourceY);
      const pieceOffset = pixelOffset(pieceSize, x, y);
      scene.copy(piece, pieceOffset, sourceOffset, sourceOffset + 4);
    }
  }
  cutHole(background, width, height, pieceSize, gapX, gapY);
}

/**
 * 挑选与真缺口不重叠的干扰缺口坐标。
 * 干扰块只出现在背景上，滑块仍对应唯一真缺口。
 */
function pickDistractorPositions(
  width: number,
  height: number,
  pieceSize: number,
  gapX: number,
  gapY: number,
  count: number,
): Array<{ x: number; y: number }> {
  const rnd = createPrng();
  const minX = pieceSize + 20;
  const maxX = width - pieceSize - 10;
  const minY = 10;
  const maxY = height - pieceSize - 10;
  const minDist = pieceSize + 8;
  const occupied = [{ x: gapX, y: gapY }];
  const result: Array<{ x: number; y: number }> = [];

  for (let attempt = 0; attempt < 80 && result.length < count; attempt++) {
    const x = Math.floor(minX + rnd() * Math.max(maxX - minX, 1));
    const y = Math.floor(minY + rnd() * Math.max(maxY - minY, 1));
    const ok = occupied.every(
      (p) => Math.hypot(p.x - x, p.y - y) >= minDist,
    );
    if (!ok) continue;
    occupied.push({ x, y });
    result.push({ x, y });
  }
  return result;
}

export function renderCaptchaImages(
  width: number,
  height: number,
  pieceSize: number,
  gapX: number,
  gapY: number,
): { backgroundImage: string; sliderImage: string } {
  const scene = buildScene(width, height);
  const background = Buffer.from(scene);
  const piece = Buffer.alloc(pieceSize * pieceSize * 4);

  // 真缺口：裁滑块 + 挖洞
  cutPieceAndHole(scene, background, piece, width, height, pieceSize, gapX, gapY);

  // 2 个干扰缺口：仅挖洞，不生成对应滑块，增加辨识难度
  for (const d of pickDistractorPositions(width, height, pieceSize, gapX, gapY, 2)) {
    cutHole(background, width, height, pieceSize, d.x, d.y);
  }

  const toDataUrl = (png: Buffer) =>
    `data:image/png;base64,${png.toString('base64')}`;
  return {
    backgroundImage: toDataUrl(encodePng(width, height, background)),
    sliderImage: toDataUrl(encodePng(pieceSize, pieceSize, piece)),
  };
}
