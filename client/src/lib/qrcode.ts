/**
 * Pure TypeScript ISO/IEC 18004 QR Code Generator (Offline 100%, Zero Dependencies)
 * Supports UTF-8 (Thai & English), Versions 1-40, Error Correction Levels L, M, Q, H
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  version: number;
  size: number;
  modules: boolean[][];
}

const ECC_FORMAT_BITS: Record<QrEccLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

// Error correction codewords per block for Versions 1..40
const EC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, number[]> = {
  L: [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
    30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
    30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

// Number of error correction blocks for Versions 1..40
const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEccLevel, number[]> = {
  L: [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13,
    14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
    25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29,
    34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35,
    37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) {
      result -= 36;
    }
  }
  return result;
}

function getNumDataCodewords(ver: number, ecl: QrEccLevel): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    EC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
  );
}

function getAlignmentPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

// GF(256) arithmetic
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonComputeDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[divisor.length - 1] = 0;
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

function addEccAndInterleave(data: Uint8Array, ver: number, ecl: QrEccLevel): Uint8Array {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = EC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const shortDataLen = shortBlockLen - blockEccLen;

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);

  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortDataLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.subarray(k, k + datLen);
    k += datLen;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    dataBlocks.push(dat);
    eccBlocks.push(ecc);
  }

  const result = new Uint8Array(rawCodewords);
  let idx = 0;

  // 1. Interleave data codewords from all blocks
  const maxDataLen = shortDataLen + (numShortBlocks < numBlocks ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < dataBlocks[j].length) {
        result[idx++] = dataBlocks[j][i];
      }
    }
  }

  // 2. Interleave error correction codewords from all blocks
  for (let i = 0; i < blockEccLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      result[idx++] = eccBlocks[j][i];
    }
  }

  return result;
}

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) {
    bb.push((val >>> i) & 1);
  }
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/**
 * Generate QR Code matrix from any UTF-8 text string
 */
export function generateQrMatrix(text: string, ecl: QrEccLevel = 'M'): QrMatrix {
  const utf8Bytes = new TextEncoder().encode(text);

  // Find smallest version that fits the UTF-8 byte stream
  let version = 1;
  for (; version <= 40; version++) {
    const charCountBits = version <= 9 ? 8 : 16;
    const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    if (4 + charCountBits + utf8Bytes.length * 8 <= dataCapacityBits) {
      break;
    }
  }
  if (version > 40) {
    throw new Error('ข้อความยาวเกินความจุสูงสุดของ QR Code');
  }

  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
  const bb: number[] = [];

  // Mode indicator: Byte mode = 0100 (4)
  appendBits(0b0100, 4, bb);
  // Character count indicator
  appendBits(utf8Bytes.length, version <= 9 ? 8 : 16, bb);
  // Payload bytes
  for (const b of utf8Bytes) {
    appendBits(b, 8, bb);
  }
  // Terminator (up to 4 zero bits)
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  // Pad to byte boundary
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  // Pad bytes (0xEC, 0x11 alternating)
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
    appendBits(padByte, 8, bb);
  }

  const dataCodewords = new Uint8Array(bb.length / 8);
  bb.forEach((bit, i) => {
    dataCodewords[i >>> 3] |= bit << (7 - (i & 7));
  });

  const allCodewords = addEccAndInterleave(dataCodewords, version, ecl);
  const size = version * 4 + 17;

  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  const setFunctionModule = (x: number, y: number, isDark: boolean) => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  const drawFinderPattern = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (0 <= xx && xx < size && 0 <= yy && yy < size) {
          setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  const drawAlignmentPattern = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  const drawFormatBits = (mask: number) => {
    const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(bits, i));
    setFunctionModule(8, 7, getBit(bits, 6));
    setFunctionModule(8, 8, getBit(bits, 7));
    setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(bits, i));
    setFunctionModule(8, size - 8, true);
  };

  const drawVersion = () => {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, color);
      setFunctionModule(b, a, color);
    }
  };

  // Draw timing patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Draw 3 finder patterns
  drawFinderPattern(3, 3);
  drawFinderPattern(size - 4, 3);
  drawFinderPattern(3, size - 4);

  // Draw alignment patterns
  const alignPatPos = getAlignmentPatternPositions(version);
  const numAlign = alignPatPos.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if (
        !((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0))
      ) {
        drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
      }
    }
  }

  // Draw temporary format bits and version bits
  drawFormatBits(0);
  drawVersion();

  // Draw codewords in 2-column zigzag
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIdx < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[bitIdx >>> 3], 7 - (bitIdx & 7));
          bitIdx++;
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
        }
        if (invert) {
          modules[y][x] = !modules[y][x];
        }
      }
    }
  };

  const getPenaltyScore = (): number => {
    let result = 0;

    // Adjacent modules in row/col having same color
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      for (let x = 0; x < size; x++) {
        if (x === 0 || modules[y][x] !== runColor) {
          runColor = modules[y][x];
          runX = 1;
        } else {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result += 1;
        }
      }
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      for (let y = 0; y < size; y++) {
        if (y === 0 || modules[y][x] !== runColor) {
          runColor = modules[y][x];
          runY = 1;
        } else {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result += 1;
        }
      }
    }

    // 2x2 blocks of same color
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          result += 3;
        }
      }
    }

    // Balance of dark and light modules
    let dark = 0;
    for (const row of modules) {
      for (const cell of row) {
        if (cell) dark++;
      }
    }
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;
    return result;
  };

  let bestMask = 0;
  let minPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormatBits(m);
    const penalty = getPenaltyScore();
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = m;
    }
    applyMask(m); // revert
  }

  applyMask(bestMask);
  drawFormatBits(bestMask);

  return { version, size, modules };
}

/**
 * Convert QR Matrix into an SVG string (with optional center logo)
 */
export function qrMatrixToSvg(
  matrix: QrMatrix,
  options: {
    margin?: number;
    fgColor?: string;
    bgColor?: string;
    logoDataUrl?: string | null;
    logoScale?: number;
  } = {},
): string {
  const margin = options.margin ?? 4;
  const fgColor = options.fgColor ?? '#000000';
  const bgColor = options.bgColor ?? '#FFFFFF';
  const totalSize = matrix.size + margin * 2;

  const paths: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        paths.push(`M${x + margin},${y + margin}h1v1h-1z`);
      }
    }
  }

  const logoElements: string[] = [];
  if (options.logoDataUrl) {
    const scale = options.logoScale ?? 0.2;
    const logoSize = Number((matrix.size * scale).toFixed(2));
    const pad = Number((logoSize * 0.14).toFixed(2));
    const boxSize = Number((logoSize + pad * 2).toFixed(2));
    const boxPos = Number(((totalSize - boxSize) / 2).toFixed(2));
    const logoPos = Number(((totalSize - logoSize) / 2).toFixed(2));
    const rx = Number((boxSize * 0.18).toFixed(2));

    logoElements.push(
      `<rect x="${boxPos}" y="${boxPos}" width="${boxSize}" height="${boxSize}" rx="${rx}" fill="${bgColor}" stroke="${fgColor}" stroke-opacity="0.12" stroke-width="0.35" shape-rendering="geometricPrecision"/>`,
      `<image href="${options.logoDataUrl}" x="${logoPos}" y="${logoPos}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" shape-rendering="auto"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${bgColor}"/>`,
    `<path d="${paths.join('')}" fill="${fgColor}"/>`,
    ...logoElements,
    `</svg>`,
  ].join('');
}
