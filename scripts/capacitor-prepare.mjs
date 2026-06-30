import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "index.html"),
  "<!DOCTYPE html><html><body>QHub</body></html>\n",
  "utf8",
);
