// The Chrome Web Store package: dist/warera-plus-<version>.zip, the
// extension folder's files with manifest.json at the root of the archive,
// without the tests. Reproducible: the files in a fixed order with a fixed
// date, so the same tree always gives the same bytes (its SHA-256 is
// printed). No dependency: a plain ZIP (deflate) written with node:zlib.
//
//   npm run package
//
// Run `npm run check` first; this script refuses a package whose manifest
// and package.json disagree on the version, or that would ship a test file
// or miss a file the manifest names.
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { deflateRawSync, crc32 } from "node:zlib";
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
  "manifest.json and package.json must carry the same version",
);

/** Every file under `dir`, as paths relative to the extension folder with forward slashes. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // .DS_Store and other dotfiles
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(relative(extension, path).replaceAll("\\", "/"));
  }
  return out;
}
// The scripts that run: the worker, the content script, the settings page's own, the modules the content
// script imports (web accessible), and every module those import. A script nothing reaches does not ship.
const reached = new Set();
async function reach(path) {
  if (reached.has(path)) return;
  reached.add(path);
  const source = await readFile(resolve(extension, path), "utf8");
  for (const m of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g))
    if (m[1].startsWith("."))
      await reach(
        relative(
          extension,
          resolve(dirname(resolve(extension, path)), m[1]),
        ).replaceAll("\\", "/"),
      );
}
const popupHtml = await readFile(
  resolve(extension, manifest.action.default_popup),
  "utf8",
);
for (const entry of [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((c) => c.js),
  ...[...popupHtml.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
  ...manifest.web_accessible_resources.flatMap((g) => g.resources),
])
  await reach(entry);
const SKIP = [/\.test\.mjs$/, /(^|\/)Thumbs\.db$/];
const files = (await walk(extension))
  .filter((f) => !SKIP.some((re) => re.test(f)))
  .filter((f) => !/\.m?js$/.test(f) || reached.has(f))
  .sort();

// Everything the manifest names must ship; nothing a test needs may.
const named = [
  "manifest.json",
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css ?? [])]),
  ...manifest.web_accessible_resources.flatMap((g) => g.resources),
];
for (const f of named)
  assert(files.includes(f), `missing from the package: ${f}`);
assert(!files.some((f) => /test/i.test(f)), "a test file would ship");

// 2026-01-01 00:00 as a DOS date and time, for every entry
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = await readFile(resolve(extension, name));
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBytes = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // names in UTF-8
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBytes, packed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // made by
  central.writeUInt16LE(20, 6); // needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBytes);
  offset += local.length + nameBytes.length + packed.length;
}
const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, directory, end]);

const out = resolve(root, "dist", `warera-plus-${manifest.version}.zip`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, zip);
const size = (await stat(out)).size;
console.log(
  `${relative(root, out)}: ${files.length} files, ${(size / 1024).toFixed(1)} KB, sha256 ${createHash("sha256").update(zip).digest("hex")}`,
);
