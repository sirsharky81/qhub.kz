import { redisExpire, redisGet, redisIncr } from "./redis";
import {
  DEFAULT_MAX_DM_ENVELOPES,
  DEFAULT_MAX_ROOM_ENVELOPES,
  DEFAULT_MSG_TTL_HOURS,
  DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  DEFAULT_ROOM_USER_INDEX_TTL_SEC,
  MESSENGER_ROOM_MAX_PARTICIPANTS,
} from "./constants";

const METRIC_PREFIX = "qhub:messenger:metrics";
const BUCKET_SEC = 60;
const KEEP_SEC = 60 * 60; // 1 hour

export const MESSENGER_METRIC_ENDPOINTS = [
  "poll",
  "dialogs",
  "send",
  "dialogs_read",
  "room_read",
] as const;

export type MessengerMetricEndpoint = (typeof MESSENGER_METRIC_ENDPOINTS)[number];

function bucketNow(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / BUCKET_SEC);
}

function metricKey(endpoint: MessengerMetricEndpoint, metric: string, bucket: number): string {
  return `${METRIC_PREFIX}:${endpoint}:${metric}:${bucket}`;
}

function statusMetric(status: number): string {
  if (status === 429) return "status_429";
  if (status >= 500) return "status_5xx";
  if (status >= 400) return "status_4xx";
  if (status >= 300) return "status_3xx";
  if (status >= 200) return "status_2xx";
  return "status_other";
}

export async function trackMessengerApiRequest(
  endpoint: MessengerMetricEndpoint,
  status: number,
): Promise<void> {
  try {
    const bucket = bucketNow();
    const totalKey = metricKey(endpoint, "total", bucket);
    const statusKey = metricKey(endpoint, statusMetric(status), bucket);
    await redisIncr(totalKey);
    await redisExpire(totalKey, KEEP_SEC);
    await redisIncr(statusKey);
    await redisExpire(statusKey, KEEP_SEC);
  } catch {
    // best-effort metrics should never break product flow
  }
}

async function sumMetric(
  endpoint: MessengerMetricEndpoint,
  metric: string,
  fromBucketInclusive: number,
  toBucketInclusive: number,
): Promise<number> {
  let sum = 0;
  for (let bucket = fromBucketInclusive; bucket <= toBucketInclusive; bucket += 1) {
    const raw = await redisGet(metricKey(endpoint, metric, bucket));
    const n = Number(raw ?? "0");
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export interface MessengerEndpointHealth {
  endpoint: MessengerMetricEndpoint;
  requestsLastMinute: number;
  requestsLast5Min: number;
  errorsLast5Min: number;
  rateLimitedLast5Min: number;
}

export async function getMessengerHealthSnapshot(): Promise<{
  generatedAt: number;
  totals: {
    requestsLastMinute: number;
    requestsLast5Min: number;
    errorsLast5Min: number;
    rateLimitedLast5Min: number;
  };
  endpoints: MessengerEndpointHealth[];
  guardrails: {
    roomMaxParticipants: number;
    maxDmEnvelopes: number;
    maxRoomEnvelopes: number;
    msgTtlHours: number;
    roomInactiveTtlHours: number;
    roomUserIndexTtlSec: number;
  };
}> {
  const generatedAt = Date.now();
  const currentBucket = bucketNow(generatedAt);
  const minuteStart = currentBucket;
  const fiveMinStart = currentBucket - 4;

  const endpoints = await Promise.all(
    MESSENGER_METRIC_ENDPOINTS.map(async (endpoint) => {
      const requestsLastMinute = await sumMetric(endpoint, "total", minuteStart, currentBucket);
      const requestsLast5Min = await sumMetric(endpoint, "total", fiveMinStart, currentBucket);
      const errors4xx = await sumMetric(endpoint, "status_4xx", fiveMinStart, currentBucket);
      const errors5xx = await sumMetric(endpoint, "status_5xx", fiveMinStart, currentBucket);
      const rateLimitedLast5Min = await sumMetric(endpoint, "status_429", fiveMinStart, currentBucket);
      return {
        endpoint,
        requestsLastMinute,
        requestsLast5Min,
        errorsLast5Min: errors4xx + errors5xx,
        rateLimitedLast5Min,
      } satisfies MessengerEndpointHealth;
    }),
  );

  const totals = endpoints.reduce(
    (acc, e) => ({
      requestsLastMinute: acc.requestsLastMinute + e.requestsLastMinute,
      requestsLast5Min: acc.requestsLast5Min + e.requestsLast5Min,
      errorsLast5Min: acc.errorsLast5Min + e.errorsLast5Min,
      rateLimitedLast5Min: acc.rateLimitedLast5Min + e.rateLimitedLast5Min,
    }),
    { requestsLastMinute: 0, requestsLast5Min: 0, errorsLast5Min: 0, rateLimitedLast5Min: 0 },
  );

  return {
    generatedAt,
    totals,
    endpoints,
    guardrails: {
      roomMaxParticipants: MESSENGER_ROOM_MAX_PARTICIPANTS,
      maxDmEnvelopes: Number(process.env.MESSENGER_MAX_DM_ENVELOPES ?? DEFAULT_MAX_DM_ENVELOPES),
      maxRoomEnvelopes: Number(process.env.MESSENGER_MAX_ROOM_ENVELOPES ?? DEFAULT_MAX_ROOM_ENVELOPES),
      msgTtlHours: Number(process.env.MESSENGER_MSG_TTL_HOURS ?? DEFAULT_MSG_TTL_HOURS),
      roomInactiveTtlHours: Number(
        process.env.MESSENGER_ROOM_INACTIVE_TTL_HOURS ?? DEFAULT_ROOM_INACTIVE_TTL_HOURS,
      ),
      roomUserIndexTtlSec: Number(
        process.env.MESSENGER_ROOM_USER_INDEX_TTL_SEC ?? DEFAULT_ROOM_USER_INDEX_TTL_SEC,
      ),
    },
  };
}
