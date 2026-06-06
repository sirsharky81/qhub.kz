import OpenAI from "openai";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY не настроен" }, { status: 500 });
  }

  let body: { title: string; description: string; cuisine: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `A professional food photography photo of "${body.title}", ${body.description}. ${body.cuisine} cuisine. Beautifully plated on a clean ceramic dish, natural daylight, shallow depth of field, appetizing and realistic, top-down or 45-degree angle shot, high resolution.`;

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      return Response.json({ error: "Изображение не сгенерировано" }, { status: 500 });
    }

    return Response.json({ imageUrl });
  } catch (err) {
    console.error("DALL-E error:", err);
    const message = err instanceof Error ? err.message : "Ошибка генерации изображения";
    return Response.json({ error: message }, { status: 500 });
  }
}
