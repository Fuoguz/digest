// Copies the local OCR engine (Tesseract.js) and language data into vendor/tesseract,
// so scanned PDFs are recognised in the browser from Digest's own origin.
// Run after `npm install` when updating tesseract.js: node scripts/vendor-ocr.mjs
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "vendor", "tesseract");
const mod = (...p) => path.join(root, "node_modules", ...p);

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "core"), { recursive: true });
await mkdir(path.join(target, "lang"), { recursive: true });
for (const file of ["tesseract.esm.min.js", "worker.min.js"])
  await cp(mod("tesseract.js", "dist", file), path.join(target, file));
// LSTM-only engines (embedded wasm); the browser picks the fastest supported build.
for (const file of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
])
  await cp(mod("tesseract.js-core", file), path.join(target, "core", file));
for (const lang of ["chi_sim", "eng"])
  await cp(
    mod("@tesseract.js-data", lang, "4.0.0_best_int", lang + ".traineddata.gz"),
    // Still gzip-compressed, but without a ".gz" name: download managers (e.g. IDM)
    // intercept .gz/.bin requests in the browser. Tesseract detects gzip by content.
    path.join(target, "lang", lang + ".traineddata"),
  );
const version = async (...p) => JSON.parse(await readFile(mod(...p, "package.json"), "utf8")).version;
await writeFile(
  path.join(target, "NOTICE.txt"),
  [
    "tesseract.js " + (await version("tesseract.js")) + " — Apache-2.0 — https://github.com/naptha/tesseract.js",
    "tesseract.js-core " + (await version("tesseract.js-core")) + " — Apache-2.0 — https://github.com/naptha/tesseract.js-core",
    "Language data (chi_sim, eng; 4.0.0_best_int) via @tesseract.js-data — Apache-2.0 models from tesseract-ocr/tessdata_best",
    "",
  ].join("\n"),
);
console.log("Vendored local OCR into vendor/tesseract");
