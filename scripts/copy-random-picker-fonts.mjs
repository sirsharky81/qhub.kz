import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "node_modules", "@fontsource", "roboto", "files");
const outDir = path.join(root, "public", "fonts");

const FILES = [
  ["roboto-cyrillic-400-normal.woff2", "Roboto-Regular.woff2"],
  ["roboto-cyrillic-700-normal.woff2", "Roboto-Bold.woff2"],
];

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const [src, dest] of FILES) {
    await copyFile(path.join(srcDir, src), path.join(outDir, dest));
    console.log(`Copied ${dest}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
