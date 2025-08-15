import { xxh64 } from './xxhash64';

const tests: [Uint8Array, bigint, bigint][] = [
  [utf8``, 0n, 0xef46db3751d8e999n],
  [utf8``, 1n, 0xd5afba1336a3be4bn],
  [utf8`a`, 0n, 0xd24ec4f1a98c6e5bn],
  [utf8`as`, 0n, 0x1c330fb2d66be179n],
  [utf8`asd`, 0n, 0x631c37ce72a97393n],
  [utf8`asdf`, 0n, 0x415872f599cea71en],
  [utf8`Call me Ishmael.`, 0n, 0x6d04390fc9d61a90n],
  [
    utf8`Some years ago--never mind how long precisely-`,
    0n,
    0x8f26f2b986afdc52n,
  ],
  // Exactly 63 characters, which exercises all code paths.
  [
    utf8`Call me Ishmael. Some years ago--never mind how long precisely-`,
    0n,
    0x02a2e85470d6fd96n,
  ],
  // 64 chars for good measure
  [
    utf8`Call me Ishmael.  Some years ago--never mind how long precisely-`,
    0n,
    0x3b1137909300afa6n,
  ],
  [utf8`0123456789abcdef`, 0n, 0x5c5b90c34e376d0bn],
  [utf8`0123456789abcdef0123456789abcdef`, 0n, 0x642a94958e71e6c5n],
];

for (const [input, seed, h64] of tests) {
  const hash = xxh64(input, BigInt(seed));
  console.log('\nINPUT ' + JSON.stringify(Buffer.from(input).toString()));
  console.log('EXPECTED xxh64 ' + h64.toString(16));
  console.log('ACTUAL   xxh64 ' + hash.toString(16));
  if (hash !== h64) {
    throw new Error('HASH64 MISMATCH');
  }
}

function utf8(arr: TemplateStringsArray): Uint8Array {
  return new TextEncoder().encode(arr[0]);
}

const xxhash = require('@node-rs/xxhash')

const seedCount = 1024
const stringCount = 1024
const seedData = new Uint8Array(seedCount * 8);
crypto.getRandomValues(seedData);
const seeds = new BigUint64Array(seedData.buffer);

console.log(`\nFuzz testing with ${seedCount} seeds and ${stringCount} unique length inputs comparing with bun and @node-rs/xxhash`)
for (let len = 0; len < stringCount; len++) {
  const input = new Uint8Array(len);
  crypto.getRandomValues(input);
  process.stdout.write('.')
  for (let s = 0; s < seedCount; s++) {
    const seed = seeds[s];
    const expectedHash = Bun.hash.xxHash64(input, seed);
    const expectedHash2 = xxhash.xxh64(input, seed);
    const actualHash = xxh64(input, seed);
    if (actualHash !== expectedHash2) {
      console.error({
        input,
        seed,
        expectedHash: expectedHash.toString(16),
        expectedHash2: expectedHash2.toString(16),
        actualHash: actualHash.toString(16),
      })
      throw new Error(`HASH MISMATCH for seed ${seed} and length ${len}`);
    }
    // Uncomment to show Bun failures
    // if (expectedHash !== expectedHash2) {
    //   console.log(Buffer.from(input).toString('hex'))
    //   console.warn(`Bun.hash.xxHash64(${input.length} byte random input, ${seed}) mismatch with @node-rs/xxhash`)
    // }
  }
}
console.log('\nAll tests passed successfully!');