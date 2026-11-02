import fs from "node:fs";
import path from "node:path";
import {
  sanitizeTpmsRecipe,
  type TpmsRegistrationRecipe,
} from "@/lib/obd/mitsubishi-tpms-registration";

const FILE_NAME = "mut-tpms-registration.json";

let cached: Record<string, TpmsRegistrationRecipe> | null = null;

export function resetTpmsRegistrationCache(): void {
  cached = null;
}

function dictionaryFile(): string | null {
  const fromEnv = process.env.ETACS_DICTIONARY_DIR?.trim();
  if (!fromEnv) return null;
  return path.join(path.resolve(fromEnv), FILE_NAME);
}

export function loadTpmsRegistrationRecipes(): Record<string, TpmsRegistrationRecipe> {
  if (cached) return cached;
  const file = dictionaryFile();
  if (!file || !fs.existsSync(file)) {
    cached = {};
    return cached;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { bySkey?: Record<string, unknown> };
  const recipes: Record<string, TpmsRegistrationRecipe> = {};
  for (const [skey, raw] of Object.entries(parsed.bySkey ?? {})) {
    const recipe = sanitizeTpmsRecipe(skey, raw);
    if (recipe) recipes[skey] = recipe;
  }
  cached = recipes;
  return cached;
}

export function tpmsRecipeForSkey(skey: string): TpmsRegistrationRecipe | null {
  return loadTpmsRegistrationRecipes()[skey] ?? null;
}
