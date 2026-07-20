import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { REDIS_KZ_MAPS_TRACK_PREFIX } from "@/lib/kz-maps/constants";
import { isRedisConfigured } from "@/lib/redis/env";
import { redisGetJson, redisKeys, redisDel, redisSet } from "@/lib/redis/commands";
import type { UserTrackMeta } from "@/lib/kz-maps/types";

function trackKey(deviceId: string, trackId: string): string {
  return `${REDIS_KZ_MAPS_TRACK_PREFIX}${deviceId}:${trackId}`;
}

function deviceTracksPattern(deviceId: string): string {
  return `${REDIS_KZ_MAPS_TRACK_PREFIX}${deviceId}:*`;
}

export async function GET(request: Request) {
  const deviceId = request.headers.get("x-kz-maps-device-id")?.trim();
  if (!deviceId) {
    return withCors(NextResponse.json({ error: "device id required" }, { status: 400 }), request);
  }

  if (!isRedisConfigured()) {
    return withCors(NextResponse.json({ tracks: [] }), request);
  }

  const { searchParams } = new URL(request.url);
  const publicOnly = searchParams.get("public") === "1";

  if (publicOnly) {
    const allKeys = await redisKeys(`${REDIS_KZ_MAPS_TRACK_PREFIX}*`);
    const tracks: UserTrackMeta[] = [];
    for (const key of allKeys.slice(0, 200)) {
      const meta = await redisGetJson<UserTrackMeta & { gpx?: string }>(key);
      if (meta?.isPublic) {
        const { gpx: _, ...rest } = meta;
        tracks.push(rest);
      }
    }
    return withCors(NextResponse.json({ tracks }), request);
  }

  const keys = await redisKeys(deviceTracksPattern(deviceId));
  const tracks: UserTrackMeta[] = [];
  for (const key of keys) {
    const meta = await redisGetJson<UserTrackMeta & { gpx?: string }>(key);
    if (meta) {
      const { gpx: _, ...rest } = meta;
      tracks.push(rest);
    }
  }

  return withCors(
    NextResponse.json({ tracks: tracks.sort((a, b) => b.createdAt - a.createdAt) }),
    request,
  );
}

export async function POST(request: Request) {
  const deviceId = request.headers.get("x-kz-maps-device-id")?.trim();
  if (!deviceId) {
    return withCors(NextResponse.json({ error: "device id required" }, { status: 400 }), request);
  }

  if (!isRedisConfigured()) {
    return withCors(NextResponse.json({ error: "Синхронизация недоступна" }, { status: 503 }), request);
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      region?: string;
      distanceM?: number;
      durationSec?: number;
      pointCount?: number;
      gpx?: string;
      isPublic?: boolean;
      createdAt?: number;
    };

    const id = body.id?.trim();
    const name = body.name?.trim().slice(0, 120);
    const gpx = body.gpx;

    if (!id || !name || !gpx || gpx.length > 2_000_000) {
      return withCors(NextResponse.json({ error: "Некорректные данные трека" }, { status: 400 }), request);
    }

    const meta: UserTrackMeta & { gpx: string } = {
      id,
      userId: deviceId,
      name,
      region: body.region,
      distanceM: Math.round(body.distanceM ?? 0),
      durationSec: Math.round(body.durationSec ?? 0),
      pointCount: Math.round(body.pointCount ?? 0),
      createdAt: body.createdAt ?? Date.now(),
      isPublic: Boolean(body.isPublic),
      gpx,
    };

    await redisSet(trackKey(deviceId, id), JSON.stringify(meta), 365 * 24 * 3600);
    const { gpx: _gpx, ...publicMeta } = meta;

    return withCors(NextResponse.json({ ok: true, track: publicMeta }), request);
  } catch {
    return withCors(NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 }), request);
  }
}

export async function DELETE(request: Request) {
  const deviceId = request.headers.get("x-kz-maps-device-id")?.trim();
  if (!deviceId) {
    return withCors(NextResponse.json({ error: "device id required" }, { status: 400 }), request);
  }

  if (!isRedisConfigured()) {
    return withCors(NextResponse.json({ ok: true }), request);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return withCors(NextResponse.json({ error: "track id required" }, { status: 400 }), request);
  }

  await redisDel(trackKey(deviceId, id));
  return withCors(NextResponse.json({ ok: true }), request);
}
