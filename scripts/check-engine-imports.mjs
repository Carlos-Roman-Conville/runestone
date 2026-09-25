// Layer guard: engine/ may import nothing outside engine/ except Node built-ins used by tests.
// Fails CI if any engine file imports pixi, capacitor, game/, ops/, tools/ or a node_module.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const engineDir = join(root, "engine");
const forbidden = [/^pixi/, /^@capacitor/, /^@pixi/, /\/game\//, /^\.\.\/game/, /^\.\.\/ops/, /^\.\.\/tools/];
let failures = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) check(p);
  }
}

function check(file) {
  const src = readFileSync(file, "utf8");
  const re = /(?:import|export)\s[^'"]*from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] ?? m[2];
    const isRelative = spec.startsWith(".");
    const bad = forbidden.some((f) => f.test(spec)) || (!isRelative && !spec.startsWith("node:"));
    if (bad) {
      failures++;
      console.error(`${relative(root, file)}: forbidden import "${spec}"`);
    }
  }
}

walk(engineDir);
if (failures) {
  console.error(`\n${failures} forbidden import(s). engine/ must stay free of the renderer, ops and packages.`);
  process.exit(1);
}
console.log("engine/ imports clean.");
