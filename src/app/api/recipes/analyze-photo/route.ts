import OpenAI from "openai";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OpenAI API key не настроен. Добавьте OPENAI_API_KEY в .env.local" },
      { status: 500 }
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let body: { image: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  if (!body.image) {
    return Response.json({ error: "Изображение не передано" }, { status: 400 });
  }

  const imageUrl = body.image.startsWith("data:")
    ? body.image
    : `data:image/jpeg;base64,${body.image}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: `Определи все продукты питания и ингредиенты, которые видны на фотографии.
Верни ответ строго в формате JSON без markdown-обёртки:
{
  "ingredients": ["продукт1", "продукт2", "продукт3", ...]
}

Правила:
- Перечисли только продукты питания (не посуду, не упаковку)
- Названия на русском языке
- Если продукт в упаковке — укажи его содержимое (например "молоко", а не "пакет")
- Минимум 1, максимум 30 продуктов
- Если продуктов не видно — верни пустой массив`,
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return Response.json({ error: "Пустой ответ от AI" }, { status: 500 });
    }

    const parsed = JSON.parse(content) as { ingredients: string[] };
    return Response.json(parsed);
  } catch (err) {
    console.error("OpenAI vision error:", err);
    const message = err instanceof Error ? err.message : "Ошибка анализа фото";
    return Response.json({ error: message }, { status: 500 });
  }
}
