// Type-cost regression guard. The library's public surface (tsconfig.budget.json)
// measured 11,371 tsc instantiations at v0.1 — the budget below is ~5x headroom.
// If this fails, some type went quadratic: find it with
//   pnpm exec tsc -p tsconfig.budget.json --noEmit --extendedDiagnostics
// and fix the type; do not raise the budget without understanding why.
import { execSync } from 'node:child_process';

const BUDGET = 60_000;

const out = execSync('pnpm exec tsc -p tsconfig.budget.json --noEmit --extendedDiagnostics', {
  encoding: 'utf8',
});
const match = out.match(/^Instantiations:\s+(\d+)/m);
if (!match) {
  console.error(out);
  throw new Error('could not read Instantiations from tsc --extendedDiagnostics');
}
const n = Number(match[1]);
console.log(`type budget: ${n.toLocaleString()} instantiations (budget ${BUDGET.toLocaleString()})`);
if (n > BUDGET) {
  throw new Error(`type budget exceeded: ${n} > ${BUDGET}`);
}
