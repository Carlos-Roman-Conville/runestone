// Regenerate engine.tests/golden/*.json from the scenarios in engine.tests/golden.test.ts.
// The only sanctioned way to change a fixture (see .cursor/rules/20-tests.mdc). Say so in the commit.
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["vitest", "run", "engine.tests/golden.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, UPDATE_GOLDEN: "1" },
});
process.exit(r.status ?? 1);
