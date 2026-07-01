import { platformFetch } from "@/lib/platform/api-client";
import type { CuisineType, MealCategory, Recipe } from "./types";

export type GenerateRecipesResult = {
  recipes: Recipe[];
  intent?: string;
};

export async function generateRecipes(
  query: string,
  cuisine: CuisineType,
  category: MealCategory,
  strictIngredients: boolean,
): Promise<GenerateRecipesResult> {
  const res = await platformFetch("/api/recipes/generate", {
    method: "POST",
    body: JSON.stringify({ query: query.trim(), cuisine, category, strictIngredients }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Не удалось подобрать рецепты");
  }
  return data;
}

export async function analyzeRecipePhoto(imageDataUrl: string): Promise<string[]> {
  const res = await platformFetch("/api/recipes/analyze-photo", {
    method: "POST",
    body: JSON.stringify({ image: imageDataUrl }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Ошибка анализа фото");
  }
  return data.ingredients ?? [];
}
