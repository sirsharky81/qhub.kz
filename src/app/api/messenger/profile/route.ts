import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/messenger/constants";
import { getProfile, saveProfile } from "@/lib/messenger/store";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const profile = await getProfile(phone);
    return NextResponse.json({
      phone,
      displayName: profile?.displayName ?? null,
      updatedAt: profile?.updatedAt ?? null,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    let body: { displayName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }
    const raw = (body.displayName ?? "").trim();
    const displayName = raw.length > 0 ? raw.slice(0, MAX_DISPLAY_NAME_LENGTH) : null;
    const profile = {
      phone,
      displayName,
      updatedAt: Date.now(),
    };
    await saveProfile(profile);
    return NextResponse.json(profile);
  } catch (err) {
    return jsonAuthError(err);
  }
}
