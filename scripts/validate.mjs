import { readFile, access, readdir } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extension = resolve(root, "extension");
const manifest = JSON.parse(
  await readFile(resolve(extension, "manifest.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert.equal(
  manifest.version,
  pkg.version,
  "Package and manifest versions must match",
);
assert.equal(manifest.manifest_version, 3);
// What the Chrome Web Store refuses at upload, checked before it gets there.
assert(
  manifest.description.length <= 132,
  `The store takes a description of 132 characters at most (${manifest.description.length})`,
);
assert(
  manifest.name.length <= 75,
  "The store takes a name of 75 characters at most",
);
assert(
  /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(manifest.version) &&
    manifest.version.split(".").every((n) => Number(n) <= 65535),
  "A version is one to four dot-separated integers of 0-65535",
);
assert(!Object.hasOwn(manifest, "key"), "A store package carries no key field");
assert(
  String(manifest.homepage_url ?? "").startsWith("https://"),
  "The homepage is an https address",
);
const icon = await readFile(resolve(extension, manifest.icons["128"]));
assert(
  icon.subarray(1, 4).toString() === "PNG" &&
    icon.readUInt32BE(16) === 128 &&
    icon.readUInt32BE(20) === 128,
  "The store icon is a 128x128 PNG",
);
const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
assert(
  changelog.includes(`## ${manifest.version}`),
  `CHANGELOG.md has no entry for ${manifest.version}`,
);
// unlimitedStorage: the player's whole transaction history is kept in extension storage (no install warning).
assert.deepEqual(manifest.permissions, ["storage", "unlimitedStorage"]);
assert.deepEqual(manifest.host_permissions, ["https://api2.warera.io/*"]);
const publicFiles = new Set(
  manifest.web_accessible_resources.flatMap((group) => group.resources),
);
assert(
  ![...publicFiles].some(
    (path) =>
      path.includes("*") ||
      path.includes(".test.") ||
      /api|controller|background/.test(path),
  ),
  "Only content modules may be public",
);
const seen = new Set();
async function imports(path, publicModule = false) {
  const file = resolve(extension, path);
  await access(file);
  if (publicModule)
    assert(publicFiles.has(path), `Missing web-accessible module: ${path}`);
  if (seen.has(path)) return;
  seen.add(path);
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(
    /(?:from\s+|import\s*)['"]([^'"]+)['"]/g,
  )) {
    assert(
      match[1].startsWith("."),
      `Runtime dependency must be local: ${path} -> ${match[1]}`,
    );
    const next = relative(
      extension,
      resolve(dirname(file), match[1]),
    ).replaceAll("\\", "/");
    assert(!next.startsWith(".."), "Import escapes extension");
    await imports(next, publicModule);
  }
}
await imports("lib/app.mjs", true);
await imports(manifest.background.service_worker);
await imports("popup.js");
for (const path of [
  ...Object.values(manifest.icons),
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((c) => [...c.js, ...c.css]),
])
  await access(resolve(extension, path));
for (const path of await readdir(resolve(extension, "lib"))) {
  if (path.endsWith(".test.mjs")) continue;
  const source = await readFile(resolve(extension, "lib", path), "utf8");
  if (!["api.mjs", "controller.mjs"].includes(path))
    assert(
      !/x-api-key|\.storage\.(local|sync)/.test(source),
      `Secret access outside worker: ${path}`,
    );
}
console.log(
  `Validated WarEra Plus ${manifest.version}: ${seen.size} modules, ${publicFiles.size} public modules, no runtime dependencies.`,
);
