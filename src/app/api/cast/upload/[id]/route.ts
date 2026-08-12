import { withCors } from "@/lib/api/cors";
import { purgeCastUploadById } from "@/lib/cast/upload-store";

export const runtime = "nodejs";

/** Delete ephemeral cast upload (tmp file + Redis). Used on disconnect / video change / pagehide. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const uploadId = id?.trim();
  if (!uploadId) {
    return withCors(Response.json({ error: "Неверный id" }, { status: 400 }), request);
  }

  try {
    await purgeCastUploadById(uploadId);
    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    console.error("[cast/upload DELETE]", err);
    return withCors(Response.json({ error: "Не удалось удалить" }, { status: 500 }), request);
  }
}
