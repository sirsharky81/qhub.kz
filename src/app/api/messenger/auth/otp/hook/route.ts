import { NextResponse } from "next/server";

/** AutoCall status callback. Confirmation is checked with GET /otp/{id}, not this body. */
export async function POST() {
  return NextResponse.json({ ok: true });
}
