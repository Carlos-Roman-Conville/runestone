/**
 * Idempotently adds Google's AdMob *test* APPLICATION_ID to the generated Android manifest.
 * Run after `npx cap add android` when android/ is not in git (STEP1_EXPORT step 3).
 * Does not write real ad ids.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml");
const TEST_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const marker = "com.google.android.gms.ads.APPLICATION_ID";
const block = `        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="${TEST_APP_ID}" />
`;

let xml;
try {
  xml = readFileSync(manifestPath, "utf8");
} catch {
  console.error(`Missing ${manifestPath}. Run: npm run build && npx cap add android && npx cap sync`);
  process.exit(1);
}

if (xml.includes(marker)) {
  console.log("AndroidManifest already has AdMob APPLICATION_ID.");
  process.exit(0);
}

const needle = 'android:theme="@style/AppTheme">';
if (!xml.includes(needle)) {
  console.error("AndroidManifest layout unexpected; add APPLICATION_ID meta-data under <application> manually.");
  process.exit(1);
}

writeFileSync(manifestPath, xml.replace(needle, `${needle}\n\n${block}`));
console.log("Patched AndroidManifest with Google test APPLICATION_ID.");
