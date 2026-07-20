import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import {
  PROTOMAPS_ATTRIBUTION_HTML,
  PROTOMAPS_PLANET_URL,
  PROTOMAPS_REGION_MAX_ZOOM,
  regionBboxToProtomapsArg,
} from "@/lib/kz-maps/offline-map-source";
import { getKzRegionBundle } from "@/lib/kz-maps/regions";

export const runtime = "nodejs";
export const maxDuration = 300;

const PMTILES_BIN =
  process.env.PMTILES_CLI_PATH?.trim() ||
  process.env.KZ_MAPS_PMTILES_CLI?.trim() ||
  "pmtiles";

function runPmtilesExtract(
  planetUrl: string,
  outputPath: string,
  bboxArg: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PMTILES_BIN,
      [
        "extract",
        planetUrl,
        outputPath,
        `--bbox=${bboxArg}`,
        `--maxzoom=${PROTOMAPS_REGION_MAX_ZOOM}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

function extractErrorResponse(
  request: Request,
  payload: Record<string, unknown>,
) {
  return withCors(NextResponse.json(payload, { status: 503 }), request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ region: string }> },
) {
  const { region: regionId } = await context.params;
  const bundle = getKzRegionBundle(regionId);
  if (!bundle) {
    return withCors(NextResponse.json({ error: "region_not_found" }, { status: 404 }), request);
  }

  const bboxArg = regionBboxToProtomapsArg(bundle.bbox);
  const tmpDir = await mkdtemp(join(tmpdir(), "kz-pmtiles-extract-"));
  const outPath = join(tmpDir, `${regionId}.pmtiles`);

  try {
    const { code, stderr } = await runPmtilesExtract(PROTOMAPS_PLANET_URL, outPath, bboxArg);
    if (code !== 0) {
      await rm(tmpDir, { recursive: true, force: true });
      return extractErrorResponse(request, {
        error: "extract_failed",
        message:
          "Не удалось вырезать регион из архива Protomaps (OpenStreetMap). Проверьте pmtiles CLI на сервере.",
        detail: stderr.slice(0, 500),
        source: PROTOMAPS_PLANET_URL,
        bbox: bboxArg,
        attribution: PROTOMAPS_ATTRIBUTION_HTML,
      });
    }

    const info = await stat(outPath);
    const nodeStream = createReadStream(outPath);

    const body = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => {
          controller.close();
          void rm(tmpDir, { recursive: true, force: true });
        });
        nodeStream.on("error", (err) => {
          controller.error(err);
          void rm(tmpDir, { recursive: true, force: true });
        });
      },
      cancel() {
        nodeStream.destroy();
        void rm(tmpDir, { recursive: true, force: true });
      },
    });

    return withCors(
      new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${regionId}.pmtiles"`,
          "Content-Length": String(info.size),
          "Cache-Control": "public, max-age=86400",
          "X-Map-Attribution": PROTOMAPS_ATTRIBUTION_HTML,
          "X-Map-Data-Source": PROTOMAPS_PLANET_URL,
        },
      }),
      request,
    );
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true });
    const message = e instanceof Error ? e.message : "extract_error";
    const missingCli =
      message.includes("ENOENT") ||
      message.includes("spawn pmtiles") ||
      message.includes(`spawn ${PMTILES_BIN}`);
    return extractErrorResponse(request, {
      error: missingCli ? "pmtiles_cli_missing" : "extract_error",
      message: missingCli
        ? "Сервис подготовки офлайн-карт временно недоступен. Попробуйте позже."
        : "Не удалось подготовить офлайн-карту региона. Попробуйте позже.",
      source: PROTOMAPS_PLANET_URL,
      bbox: bboxArg,
      attribution: PROTOMAPS_ATTRIBUTION_HTML,
    });
  }
}
