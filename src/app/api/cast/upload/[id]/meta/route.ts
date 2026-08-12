import { withCors } from "@/lib/api/cors";
import { resolveCastUploadMeta } from "@/lib/cast/resolve";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const uploadId = id?.trim();
  if (!uploadId) {
    return withCors(Response.json({ error: "Неверный id" }, { status: 400 }), _request);
  }

  const meta = await resolveCastUploadMeta(uploadId);
  if (!meta) {
    return withCors(Response.json({ error: "Загрузка не найдена" }, { status: 404 }), _request);
  }

  return withCors(Response.json({ meta }), _request);
}
