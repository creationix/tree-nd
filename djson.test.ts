import { encode } from './djson.js';
import { readFileSync, writeFileSync } from 'node:fs';

const inputs = [
  'hof-prd-product-list-page-paths.arr.json',
  'hof-prd-product-list-page-paths.obj.json',
  'all_npm.json',
  'font-data.json',
  'routes.json',
  'routes2.json',
  'fintia-outputs-tree.json',
  'carbon-outputs-tree.json',
];
let totalD2 = 0;
let totalJson = 0;
for (const input of inputs) {
  console.log(`Processing ${input}...`);
  const doc = JSON.parse(readFileSync(input, 'utf-8'));
  const djson = encode(doc);
  const json = JSON.stringify(doc);
  console.log(
    `  JSON: ${json.length} bytes, DJSON: ${djson.length} bytes, ratio: ${(
      (djson.length / json.length) * 100
    ).toFixed(2)}%`,
  );
  writeFileSync(input.replace('.json', '.d2.jsonl'), djson);
  totalD2 += djson.length;
  totalJson += json.length;
}
console.log(
  `Total JSON: ${totalJson} bytes, Total DJSON: ${totalD2} bytes, ratio: ${(
    (totalD2 / totalJson) * 100
  ).toFixed(2)}%`,
);
