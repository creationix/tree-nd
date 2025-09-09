import { PrefixTrieWriter, PrefixTrieReader } from '../src/prefix-trie.ts';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

for (const file of readdirSync('.')) {
  if (file.endsWith('.json')) {
    console.log(`Processing fixtures ${file}`);
    const input = JSON.parse(readFileSync(`${file}`, 'utf-8'));
    const writer = new PrefixTrieWriter();
    writer.bulkInsert(input);
    // Verify by re-reading
    for (const [key, expected] of Object.entries(input)) {
      const actual = writer.find(key);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `Mismatch found for key "${key}": expected ${JSON.stringify(
            expected,
          )}, got ${JSON.stringify(actual)}`,
        );
      }
      if (key) {
        const actual2 = writer.find(`${key}.nope`);
        if (actual2 !== undefined) {
          throw new Error(
            `Expected key "${key}.nope" to be absent, but got ${actual2}`,
          );
        }
      }
      console.log(`${key} ✓`);
    }

    const encoded = writer.stringify();
    writeFileSync(`${file.replace('.json', '.pmap')}`, encoded);

    const reader = new PrefixTrieReader(encoded);
    for (const [key, expected] of Object.entries(input)) {
      const actual = reader.find(key);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `Mismatch found for key "${key}": expected ${JSON.stringify(
            expected,
          )}, got ${JSON.stringify(actual)}`,
        );
      }
      if (key) {
        const actual2 = reader.find(`${key}.nope`);
        if (actual2 !== undefined) {
          throw new Error(
            `Expected key "${key}.nope" to be absent, but got ${actual2}`,
          );
        }
      }
      console.log(`${key} ✓`);
    }
    console.log(`All ${Object.keys(input).length} keys verified successfully.`);
  }
}
