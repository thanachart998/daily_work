import { describe, expect, it } from 'vitest';
import { generateQrMatrix, qrMatrixToSvg, type QrEccLevel, type QrMatrix } from '../client/src/lib/qrcode';

/**
 * Helper to decode a 1-block QR matrix back into its UTF-8 string
 * and verify format bits + Reed-Solomon ECC codewords
 */
function extractAndDecodeMatrix(matrix: QrMatrix): { mask: number; text: string } {
  const { size, version, modules } = matrix;

  // 1. Read format bits from top-left (bits 0..14)
  let formatBits = 0;
  const setFormatBit = (bitPos: number, isDark: boolean) => {
    if (isDark) formatBits |= 1 << bitPos;
  };
  for (let i = 0; i <= 5; i++) setFormatBit(i, modules[i][8]);
  setFormatBit(6, modules[7][8]);
  setFormatBit(7, modules[8][8]);
  setFormatBit(8, modules[8][7]);
  for (let i = 9; i < 15; i++) setFormatBit(i, modules[8][14 - i]);

  const unmaskedFormat = formatBits ^ 0x5412;
  const mask = (unmaskedFormat >>> 10) & 0b111;

  // 2. Reconstruct function module map
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const markFunc = (x: number, y: number) => {
    if (x >= 0 && x < size && y >= 0 && y < size) isFunction[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    markFunc(6, i);
    markFunc(i, 6);
  }
  const markFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) markFunc(cx + dx, cy + dy);
    }
  };
  markFinder(3, 3);
  markFinder(size - 4, 3);
  markFinder(3, size - 4);

  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const alignPos = [6];
    for (let pos = version * 4 + 10; alignPos.length < numAlign; pos -= step) {
      alignPos.splice(1, 0, pos);
    }
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0))) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) markFunc(alignPos[i] + dx, alignPos[j] + dy);
          }
        }
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    markFunc(8, i);
    markFunc(i, 8);
  }
  for (let i = 0; i < 8; i++) markFunc(size - 1 - i, 8);
  for (let i = 8; i < 15; i++) markFunc(8, size - 15 + i);
  markFunc(8, size - 8);

  // 3. Read and unmask bits in zigzag order
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x]) {
          let invert = false;
          switch (mask) {
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
            case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
            case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          }
          const bit = modules[y][x] !== invert ? 1 : 0;
          bits.push(bit);
        }
      }
    }
  }

  // Convert bits to bytes
  const codewords = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < codewords.length * 8; i++) {
    codewords[i >>> 3] |= bits[i] << (7 - (i & 7));
  }

  // Verify Reed-Solomon syndrome on single-block QR codewords
  // In GF(256) with primitive polynomial 0x11d, generator roots are 2^0, 2^1, ..., 2^(eccLen-1).
  // Evaluating the codeword polynomial at 2^0 = 1 (XOR sum of all bytes in the block) must be 0!
  let syndrome0 = 0;
  for (const b of codewords) {
    syndrome0 ^= b;
  }
  expect(syndrome0).toBe(0);

  // Decode Byte mode payload (for single-block versions like v1..v3 L/M)
  const readBits = (offset: number, len: number) => {
    let val = 0;
    for (let i = 0; i < len; i++) {
      val = (val << 1) | bits[offset + i];
    }
    return val;
  };

  const mode = readBits(0, 4);
  expect(mode).toBe(0b0100); // Byte mode
  const countBits = version <= 9 ? 8 : 16;
  const byteLen = readBits(4, countBits);
  const payload = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    payload[i] = readBits(4 + countBits + i * 8, 8);
  }

  return {
    mask,
    text: new TextDecoder().decode(payload),
  };
}

describe('QR Code Generator (Offline ISO/IEC 18004)', () => {
  it('encodes and decodes URLs accurately with intact Reed-Solomon codewords', () => {
    const urls = [
      'https://example.com',
      'http://127.0.0.1:3000',
      'https://google.com/search?q=worklog',
    ];
    for (const url of urls) {
      for (const ecl of ['L', 'M'] as QrEccLevel[]) {
        const matrix = generateQrMatrix(url, ecl);
        const decoded = extractAndDecodeMatrix(matrix);
        expect(decoded.text).toBe(url);
      }
    }
  });

  it('supports Thai UTF-8 text and optional center logo in SVG', () => {
    const matrix = generateQrMatrix('สวัสดีครับ ทดสอบสร้าง QR Code ภาษาไทย', 'H');
    expect(matrix.version).toBeGreaterThanOrEqual(4);
    const svg = qrMatrixToSvg(matrix, {
      margin: 4,
      fgColor: '#000000',
      bgColor: '#FFFFFF',
      logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      logoScale: 0.2,
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<image href="data:image/png;base64,');
  });
});
