import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import {
  listPendingSuggestions,
  saveCommunityPlace,
  updatePendingStatus,
} from "@/lib/kz-maps/pending-store";
import type { KzPlace } from "@/lib/kz-maps/types";

async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const pending = await listPendingSuggestions();
  return NextResponse.json({ pending });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: string;
    action?: "approve" | "reject";
  };

  const id = body.id?.trim();
  const action = body.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await updatePendingStatus(id, action === "approve" ? "approved" : "rejected");
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "approve") {
    const slug = updated.name
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const place: KzPlace = {
      id: `community-${slug}-${updated.id.slice(-6)}`,
      name: updated.name,
      lat: updated.lat,
      lng: updated.lng,
      region: updated.region,
      category: updated.category,
      summary: updated.summary,
      tags: ["community"],
      source: "community",
      published: true,
      updatedAt: Date.now(),
    };
    await saveCommunityPlace(place);
    return NextResponse.json({ ok: true, place });
  }

  return NextResponse.json({ ok: true });
}
