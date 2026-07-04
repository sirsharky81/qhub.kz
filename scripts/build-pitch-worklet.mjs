import { mkdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const entry = path.join(root, "src/lib/guitar-tuner/worklet/pitch-processor.ts");
const outDir = path.join(root, "public/worklets");
const outfile = path.join(outDir, "pitch-processor.js");

async function main() {
  await mkdir(outDir, { recursive: true });
  let build;
  try {
    ({ build } = await import("esbuild"));
  } catch {
    try {
      await access(outfile);
      console.warn(
        "[build-pitch-worklet] esbuild is not installed; using existing public/worklets/pitch-processor.js",
      );
      return;
    } catch {
      throw new Error(
        "esbuild is not installed and public/worklets/pitch-processor.js is missing",
      );
    }
  }
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    target: "es2020",
    platform: "browser",
    minify: false,
    sourcemap: false,
  });
  console.log(`Built ${outfile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
