import { readFileSync } from "node:fs";
import path from "node:path";

export function readNextBuildId(): string {
  try {
    return readFileSync(path.join(process.cwd(), ".next/BUILD_ID"), "utf8").trim();
  } catch {
    return "dev";
  }
}
