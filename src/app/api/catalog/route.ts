import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCatalogForViewer } from "@/lib/admin/catalog";
import { withCors } from "@/lib/api/cors";

export async function GET(request: Request) {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const catalog = await getCatalogForViewer(host);
  return withCors(NextResponse.json(catalog), request);
}
