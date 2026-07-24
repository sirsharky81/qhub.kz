import { NextResponse } from "next/server";
import { getMailClientSettings } from "@/lib/mail/env";

export async function GET() {
  return NextResponse.json(getMailClientSettings());
}
