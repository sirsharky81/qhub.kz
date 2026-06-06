export type CuisineType =
  | "any"
  | "kazakh"
  | "russian"
  | "asian"
  | "italian"
  | "european"
  | "american"
  | "mediterranean"
  | "indian";

export type MealCategory =
  | "any"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "dessert"
  | "soup";

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  category: string;
  cookingTime: number;
  difficulty: DifficultyLevel;
  calories: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  usedIngredients: string[];
  missingIngredients: string[];
}

export interface GenerateRecipesRequest {
  ingredients: string[];
  cuisine: CuisineType;
  category: MealCategory;
}

export interface GenerateRecipesResponse {
  recipes: Recipe[];
}

export interface AnalyzePhotoResponse {
  ingredients: string[];
}

export const CUISINE_LABELS: Record<CuisineType, string> = {
  any: "Любая кухня",
  kazakh: "Казахская",
  russian: "Русская",
  asian: "Азиатская",
  italian: "Итальянская",
  european: "Европейская",
  american: "Американская",
  mediterranean: "Средиземноморская",
  indian: "Индийская",
};

export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
  any: "Любой приём пищи",
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
  dessert: "Десерт",
  soup: "Суп",
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: "Легко",
  medium: "Средне",
  hard: "Сложно",
};

export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  easy: "text-green-600 bg-green-50 border-green-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  hard: "text-red-600 bg-red-50 border-red-200",
};
