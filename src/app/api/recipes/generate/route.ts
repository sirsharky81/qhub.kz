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

  const { ingredients, cuisine, category } = body;

  if (!ingredients || ingredients.length === 0) {
    return Response.json({ error: "Список ингредиентов пуст" }, { status: 400 });
  }

  const cuisinePrompt = cuisine !== "any" ? `, кухня: ${cuisine}` : "";
  const categoryPrompt = category !== "any" ? `, категория: ${category}` : "";

  const systemPrompt = `Ты — профессиональный шеф-повар и кулинарный консультант. 
Твоя задача — предлагать вкусные, реалистичные рецепты на основе имеющихся ингредиентов.
Отвечай ТОЛЬКО на русском языке.
Возвращай ответ строго в формате JSON без markdown-обёртки.`;

  const userPrompt = `Имеющиеся продукты: ${ingredients.join(", ")}
${cuisinePrompt}${categoryPrompt}

Предложи ровно 5 блюд, которые можно приготовить из этих продуктов (допускается использование базовых специй, соли, масла и воды без перечисления).

Верни JSON в таком формате:
{
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
      "steps": ["Шаг 1...", "Шаг 2...", ...],
      "usedIngredients": ["ингредиент1", "ингредиент2"],
      "missingIngredients": []
    }
  ]
}

Важно:
- Используй максимально ингредиенты из предоставленного списка
- steps должны быть подробными (5-10 шагов)
- Калорийность должна быть реалистичной
- Обеспечь разнообразие блюд`;

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

    const parsed = JSON.parse(content) as { recipes: Recipe[] };

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
