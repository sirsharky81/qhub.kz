import { NextResponse } from "next/server";
import { getMailStatus } from "@/lib/mail/exec";

export async function GET() {
  return NextResponse.json(getMailStatus());
}
