import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.js"),
  join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js")
];

const source = candidates.find(existsSync);
if (!source) {
  console.warn("pdf.js worker not found. Run npm install again after pdfjs-dist is installed.");
  process.exit(0);
}

const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });
copyFileSync(source, join(publicDir, "pdf.worker.min.mjs"));
console.log("Copied pdf.js worker to public/pdf.worker.min.mjs");
