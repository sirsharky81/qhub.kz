import { NextResponse } from "next/server";
import { MessengerAuthError, assertMessengerSession } from "@/lib/messenger/guard";
import { isSubaruCodingPhoneAllowed } from "@/lib/subaru-coding/access";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const allowed = await isSubaruCodingPhoneAllowed(phone);
    if (!allowed) {
      return NextResponse.json(
        {
          allowed: false,
          phone,
          error: "Этот номер не допущен к Subaru Coding. Доступ выдаёт администратор.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ allowed: true, phone });
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      return NextResponse.json({ allowed: false, error: err.message }, { status: err.status });
    }
    console.error("[subaru-coding/access]", err);
    return NextResponse.json({ allowed: false, error: "Не удалось проверить доступ" }, { status: 500 });
  }
}
