import { NextResponse } from "next/server";
import { assertMessengerSession } from "@/lib/messenger/guard";
import { isVpnEnabledForPhone } from "./store";
import { isAnyVpnBackendConfigured } from "./env";

export class VpnAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function assertVpnAccess(): Promise<{ phone: string }> {
  if (!isAnyVpnBackendConfigured()) {
    throw new VpnAccessError("VPN временно недоступен", 503);
  }
  const { phone } = await assertMessengerSession();
  const enabled = await isVpnEnabledForPhone(phone);
  if (!enabled) {
    throw new VpnAccessError("VPN не включён для вашего номера", 403);
  }
  return { phone };
}

export function vpnErrorResponse(error: unknown): NextResponse {
  if (error instanceof VpnAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.name === "MessengerAuthError") {
    const status = (error as Error & { status?: number }).status ?? 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (error instanceof Error && error.message) {
    console.error("[vpn]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.error("[vpn]", error);
  return NextResponse.json({ error: "Ошибка VPN" }, { status: 500 });
}
