// Regenerates the YosukuPredict ABI from contracts/ for the web client and the app.
//
//   npm run abi   (needs Foundry: https://getfoundry.sh)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const abi = JSON.parse(
  execFileSync('forge', ['inspect', 'YosukuPredict', 'abi', '--json'], { cwd: new URL('contracts/', root), encoding: 'utf8' }),
);
const json = JSON.stringify(abi, null, 2);
const ts = `// @generated from contracts/ (forge inspect YosukuPredict abi). Do not edit by hand.
// Regenerate: npm run abi (at the repo root)
export const yosukuPredictAbi = ${json} as const;
`;

writeFileSync(new URL('client/abi/yosukuPredict.json', root), json + '\n');
writeFileSync(new URL('client/abi/yosukuPredict.ts', root), ts);
writeFileSync(new URL('mobile/lib/mezo/abi.ts', root), ts);
console.log('wrote client/abi and mobile/lib/mezo/abi.ts');
