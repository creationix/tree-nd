// xxHash
// https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md#xxh64-algorithm-description

const PRIME64_1 = 0x9e3779b185ebca87n;
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn;
const PRIME64_3 = 0x165667b19e3779f9n;
const PRIME64_4 = 0x85ebca77c2b2ae63n;
const PRIME64_5 = 0x27d4eb2f165667c5n;

export function xxh64(data: ArrayBufferView, seed: bigint): bigint {
  let ptr = 0;
  const len = data.byteLength;
  const last = ptr + len;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let h64 = 0n;
  if (len >= 32) {
    let acc1 = BigInt.asUintN(64, seed + PRIME64_1 + PRIME64_2);
    let acc2 = BigInt.asUintN(64, iadd64(seed, PRIME64_2));
    let acc3 = BigInt.asUintN(64, seed);
    let acc4 = BigInt.asUintN(64, isub64(seed, PRIME64_1));

    // For every chunk of 4 words, so 4 * 64bits = 32 bytes
    const limit = last - 32;
    do {
      acc1 = round64(acc1, view.getBigUint64(ptr, true));
      acc2 = round64(acc2, view.getBigUint64(ptr + 8, true));
      acc3 = round64(acc3, view.getBigUint64(ptr + 16, true));
      acc4 = round64(acc4, view.getBigUint64(ptr + 24, true));
      ptr += 32;
    } while (ptr <= limit);

    // Convergence
    h64 = BigInt.asUintN(
      64,
      rotl64(acc1, 1n) +
      rotl64(acc2, 7n) +
      rotl64(acc3, 12n) +
      rotl64(acc4, 18n),
    );

    h64 = merge_round64(h64, acc1);
    h64 = merge_round64(h64, acc2);
    h64 = merge_round64(h64, acc3);
    h64 = merge_round64(h64, acc4);
  } else {
    // when input is smaller than 32 bytes
    h64 = iadd64(seed, PRIME64_5);
  }

  h64 = iadd64(h64, BigInt(len));

  // For the remaining words not covered above, either 0, 1, 2 or 3
  while (ptr <= last - 8) {
    h64 = iadd64(
      imul64(
        rotl64(h64 ^ round64(0n, view.getBigUint64(ptr, true)), 27n),
        PRIME64_1,
      ),
      PRIME64_4,
    );
    ptr += 8;
  }

  // For the remaining half word.That is when there are more than 32bits
  // remaining which didn't make a whole word.
  while (ptr <= last - 4) {
    h64 = iadd64(
      imul64(
        rotl64(h64 ^ imul64(BigInt(view.getUint32(ptr, true)), PRIME64_1), 23n),
        PRIME64_2,
      ),
      PRIME64_3,
    );
    ptr += 4;
  }

  // For the remaining bytes that didn't make a half a word (32bits),
  // either 0, 1, 2 or 3 bytes, as 4bytes = 32bits = 1 / 2 word.
  while (ptr <= last - 1) {
    h64 = imul64(
      rotl64(h64 ^ imul64(BigInt(view.getUint8(ptr)), PRIME64_5), 11n),
      PRIME64_1,
    );
    ptr += 1;
  }

  // Finalize
  h64 ^= h64 >> 33n;
  h64 = imul64(h64, PRIME64_2);
  h64 ^= h64 >> 29n;
  h64 = imul64(h64, PRIME64_3);
  h64 ^= h64 >> 32n;
  return h64;
}

function round64(acc: bigint, value: bigint): bigint {
  return imul64(rotl64(iadd64(acc, imul64(value, PRIME64_2)), 31n), PRIME64_1);
}

function merge_round64(initial: bigint, val: bigint): bigint {
  return iadd64(imul64(initial ^ round64(0n, val), PRIME64_1), PRIME64_4);
}

// Rotate left modulo 64-bit
function rotl64(num: bigint, bits: bigint): bigint {
  return BigInt.asUintN(64, (num << bits)) | (num >> (64n - bits));
}

function imul64(a: bigint, b: bigint): bigint {
  return BigInt.asUintN(64, a * b);
}

function iadd64(a: bigint, b: bigint): bigint {
  return BigInt.asUintN(64, a + b);
}

function isub64(a: bigint, b: bigint): bigint {
  return BigInt.asUintN(64, a - b);
}
