import OpenAI from "openai";
import { GenerateRecipesRequest, Recipe } from "@/lib/recipe-finder/types";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OpenAI API key не настроен. Добавьте OPENAI_API_KEY в .env.local" },
      { status: 500 }
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let body: GenerateRecipesRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const { query, cuisine, category, strictIngredients } = body;

  if (!query || query.trim().length === 0) {
    return Response.json({ error: "Запрос пустой" }, { status: 400 });
  }

  const cuisineFilter = cuisine !== "any" ? `\nТип кухни: ${cuisine}` : "";
  const categoryFilter = category !== "any" ? `\nКатегория блюда: ${category}` : "";
  const strictNote = strictIngredients
    ? "\n⚠️ СТРОГИЙ РЕЖИМ: предлагай ТОЛЬКО блюда, которые можно приготовить исключительно из перечисленных ингредиентов. Никаких дополнительных продуктов. missingIngredients должен быть пустым массивом."
    : "";

  const systemPrompt = `Ты — профессиональный шеф-повар и кулинарный ИИ-помощник.
Отвечай ТОЛЬКО на русском языке.
Возвращай ответ строго в формате JSON без markdown-обёртки.`;

  const userPrompt = `Запрос пользователя: "${query.trim()}"${cuisineFilter}${categoryFilter}${strictNote}

Запрос может быть одним из:
1. Список ингредиентов (например: "яйца, картошка, лук") — предложи 5 блюд из этих продуктов
2. Название блюда (например: "борщ", "паста карбонара") — предложи это блюдо и 4 вариации или похожих
3. Пожелание (например: "хочу что-то на ужин за 30 минут", "лёгкий завтрак без глютена") — интерпретируй и предложи 5 подходящих блюд
4. Комбинация (например: "что приготовить из курицы на ужин быстро") — учти всё сразу

Определи намерение самостоятельно и предложи ровно 5 рецептов.

Верни JSON в таком формате:
{
  "intent": "ingredients | dish | wish | mixed",
  "recipes": [
    {
      "id": "уникальная строка",
      "title": "Название блюда",
      "description": "Краткое описание (1-2 предложения)",
      "cuisine": "Название кухни по-русски",
      "category": "Завтрак/Обед/Ужин/Перекус/Десерт/Суп",
      "cookingTime": число в минутах,
      "difficulty": "easy/medium/hard",
      "calories": число ккал на порцию,
      "servings": число порций,
      "ingredients": [
        { "name": "Название ингредиента", "amount": "количество и единица измерения" }
      ],
      "steps": ["Шаг 1...", "Шаг 2...", "Шаг 3..."],
      "usedIngredients": ["ингредиент1", "ингредиент2"],
      "missingIngredients": []
    }
  ]
}

Важно:
- steps должны быть подробными (5-10 шагов)
- Калорийность должна быть реалистичной
- Обеспечь разнообразие среди 5 рецептов
- Базовые специи, соль, масло, вода — считаются доступными всегда`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return Response.json({ error: "Пустой ответ от AI" }, { status: 500 });
    }

    const parsed = JSON.parse(content) as { recipes: Recipe[]; intent?: string };

    parsed.recipes = parsed.recipes.map((r, i) => ({
      ...r,
      id: r.id || `recipe-${i}-${Date.now()}`,
    }));

    return Response.json(parsed);
  } catch (err) {
    console.error("OpenAI error:", err);
    const message = err instanceof Error ? err.message : "Ошибка генерации рецептов";
    return Response.json({ error: message }, { status: 500 });
  }
}
