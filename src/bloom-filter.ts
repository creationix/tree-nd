export interface BloomFilterParameters {
  readonly n: number; // Expected number of elements (capacity)
  readonly p: number; // Desired probability of false positives
  readonly m: number; // Bit size of the filter
  readonly k: number; // Optimal number of hashes
}

export class BloomFilter {
  readonly config: BloomFilterParameters;
  readonly filter: Uint8Array;

  constructor(config: Partial<BloomFilterParameters>) {
    // Validate and set the expected number of elements
    const n = config.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new TypeError(`Invalid bloom filter number: n=${n}`);
    }
    // Validate probability and apply defaults
    const p = config.p || 1e-7;
    if (typeof p !== 'number' || p <= 0 || p >= 1) {
      throw new TypeError(`Invalid bloom filter probability: p=${p}`);
    }
    // Calculate optimal bitsize rounded up the nearest multiple of 24
    // This lets us base64 encode the filter without padding.
    const m =
      config.m ||
      Math.ceil((-n * Math.log(p)) / (Math.LN2 * Math.LN2 * 24)) * 24;
    if (typeof m !== 'number' || !Number.isInteger(m) || m <= 0) {
      throw new TypeError(`Invalid bloom filter bitsize: m=${m}`);
    }
    // Calculate the optimal number of hashes
    const k = config.k || Math.round(-Math.log2(p));
    if (typeof k !== 'number' || !Number.isInteger(k) || k <= 0) {
      throw new TypeError(`Invalid bloom filter hash count: k=${k}`);
    }
    // Initialize the config
    this.config = { n, p, m, k };
    // Initialize the filter as a byte array
    this.filter = new Uint8Array(Math.ceil(m / 8));
  }

  // The K hashes are calculated by combining the two hashes with double hashing
  *hashIterator(value: string): Generator<[number, number]> {
    const { k, m } = this.config;
    const input = new TextEncoder().encode(value);
    const [hash1, hash2] = fnv1a64(input);
    for (let i = 0; i < k; i++) {
      const offset = ((hash1 + i * hash2) >>> 0) % m;
      const byteOffset = Math.floor(offset / 8);
      const bitOffset = 7 - (offset % 8); // Invert bit order for little-endian representation
      yield [byteOffset, bitOffset];
    }
  }

  add(value: string): void {
    for (const [byteOffset, bitOffset] of this.hashIterator(value)) {
      this.filter[byteOffset] |= 1 << bitOffset;
    }
  }

  has(value: string): boolean {
    for (const [byteOffset, bitOffset] of this.hashIterator(value)) {
      if ((this.filter[byteOffset] & (1 << bitOffset)) === 0) {
        return false;
      }
    }
    return true;
  }
}

function fnv1a64(bytes: Uint8Array): [number, number] {
  const FNV_PRIME = 0x100000001b3n; // 64-bit FNV prime
  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n; // 64-bit FNV offset basis

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < bytes.length; i++) {
    hash = BigInt.asUintN(64, hash ^ BigInt(bytes[i]));
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }

  // Split into high and low 32 bits
  return [Number(hash >> 32n), Number(BigInt.asUintN(32, hash))];
}
