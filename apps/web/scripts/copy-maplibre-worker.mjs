/**
 * MapLibre 6 loads its map worker as a separate ES module. Under Next's bundler the worker's own
 * relative import of `maplibre-gl-shared.mjs` resolves to a hashed name that does not exist, so the
 * worker never starts ("Worker failed to load") and every map falls back to the site plan. Upstream's
 * advice for Next is to serve both files unhashed from `public/`; MapView points setWorkerUrl there.
 * Runs from predev / prebuild, so the copies can never drift from the installed version.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre");

await mkdir(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dist, file), join(out, file));
}
console.log(`maplibre worker copied to public/maplibre (${require("maplibre-gl/package.json").version})`);
