import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertSendAccess } from "@/lib/send/access";
import { isSendStorageConfigured } from "@/lib/send/config";
import { listOwnerTransfers } from "@/lib/send/store";

export async function GET() {
  try {
    if (!isSendStorageConfigured()) {
      return NextResponse.json({ error: "QHub Send не настроен" }, { status: 503 });
    }
    const { phone } = await assertSendAccess();
    const transfers = await listOwnerTransfers(phone);
    return NextResponse.json({ transfers });
  } catch (err) {
    return jsonAuthError(err);
  }
}
