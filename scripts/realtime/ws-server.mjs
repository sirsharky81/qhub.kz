#!/usr/bin/env node
/**
 * Standalone Messenger WebSocket server (port 3001 by default).
 * Run: node --env-file=.env.production scripts/realtime/ws-server.mjs
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
import {
  parseBearerToken,
  parseCookieToken,
  verifyMessengerSessionToken,
} from "./session-verify.mjs";
import { verifyShareParticipant } from "./share-session-verify.mjs";

const PORT = Number(process.env.MESSENGER_WS_PORT ?? "3001");
const WS_PATH = "/ws/messenger";
const SHARE_WS_PATH = "/ws/share";
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 65_000;

const REALTIME_USER_PREFIX = "qhub:realtime:user:";
const SHARE_PARTICIPANT_PREFIX = "qhub:room-core:share:participant:";
const PRESENCE_PREFIX = "qhub:messenger:presence:";
const TYPING_PREFIX = "qhub:messenger:typing:";
const PRESENCE_TTL_SEC = 45;
const TYPING_TTL_SEC = 6;
const ROOM_PARTICIPANTS_PREFIX = "qhub:messenger:room:";

function loadEnvFile(relativePath) {
  const path = resolve(process.cwd(), relativePath);
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

if (!process.env.REDIS_URL) {
  loadEnvFile(".env.production");
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

function normalizeKzPhone(input) {
  const cleaned = String(input).replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+7")) return `+7${cleaned.slice(2).replace(/\D/g, "").slice(0, 10)}`;
  if (cleaned.startsWith("8") && cleaned.length >= 11) {
    return `+7${cleaned.slice(1).replace(/\D/g, "").slice(0, 10)}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return cleaned;
}

function dmParticipants(channel) {
  if (!channel.startsWith("dm:")) return [];
  const parts = channel.split(":");
  if (parts.length !== 3) return [];
  return [normalizeKzPhone(parts[1]), normalizeKzPhone(parts[2])].filter(Boolean);
}

function roomParticipantsKey(roomId) {
  return `${ROOM_PARTICIPANTS_PREFIX}${roomId.toUpperCase()}:participants`;
}

async function getRoomParticipantPhones(redis, channel) {
  if (!channel.startsWith("room:")) return [];
  const roomId = channel.slice(5).toUpperCase();
  const raw = await redis.get(roomParticipantsKey(roomId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => normalizeKzPhone(p.phone)).filter(Boolean);
  } catch {
    return [];
  }
}

async function channelParticipants(redis, channel) {
  if (channel.startsWith("dm:")) return dmParticipants(channel);
  if (channel.startsWith("room:")) return getRoomParticipantPhones(redis, channel);
  return [];
}

function publishToPhones(redisPub, phones, event) {
  const payload = JSON.stringify(event);
  const unique = [...new Set(phones.map(normalizeKzPhone).filter(Boolean))];
  for (const phone of unique) {
    void redisPub.publish(`${REALTIME_USER_PREFIX}${phone}`, payload);
  }
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function authenticateRequest(req, queryToken) {
  const cookieToken = parseCookieToken(req.headers.cookie ?? "");
  const bearerToken = parseBearerToken(req.headers.authorization ?? "");
  const token = queryToken || bearerToken || cookieToken;
  if (!token) return null;
  return verifyMessengerSessionToken(token);
}

/** @typedef {{ ws: import('ws').WebSocket, phone: string, channels: Set<string>, authed: boolean, lastPong: number }} ClientState */

/** @type {Map<string, Set<ClientState>>} */
const clientsByPhone = new Map();

function addClient(state) {
  let set = clientsByPhone.get(state.phone);
  if (!set) {
    set = new Set();
    clientsByPhone.set(state.phone, set);
  }
  set.add(state);
}

function removeClient(state) {
  const set = clientsByPhone.get(state.phone);
  if (!set) return;
  set.delete(state);
  if (set.size === 0) clientsByPhone.delete(state.phone);
}

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error("[messenger-ws] REDIS_URL is required");
  process.exit(1);
}

/** @typedef {{ ws: import('ws').WebSocket, participantId: string, roomId: string, authed: boolean, lastPong: number }} ShareClientState */

/** @type {Map<string, Set<ShareClientState>>} */
const shareClientsByParticipant = new Map();

function addShareClient(state) {
  let set = shareClientsByParticipant.get(state.participantId);
  if (!set) {
    set = new Set();
    shareClientsByParticipant.set(state.participantId, set);
  }
  set.add(state);
}

function removeShareClient(state) {
  const set = shareClientsByParticipant.get(state.participantId);
  if (!set) return;
  set.delete(state);
  if (set.size === 0) shareClientsByParticipant.delete(state.participantId);
}

const redisPub = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
const redisSub = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
const redisData = new Redis(redisUrl, { maxRetriesPerRequest: 2 });

void redisSub.psubscribe(`${REALTIME_USER_PREFIX}*`);
void redisSub.psubscribe(`${SHARE_PARTICIPANT_PREFIX}*`);

redisSub.on("pmessage", (_pattern, channel, message) => {
  if (channel.startsWith(SHARE_PARTICIPANT_PREFIX)) {
    const participantId = channel.slice(SHARE_PARTICIPANT_PREFIX.length);
    let event;
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }
    const set = shareClientsByParticipant.get(participantId);
    if (!set) return;
    for (const client of set) {
      sendJson(client.ws, event);
    }
    return;
  }

  const phone = channel.startsWith(REALTIME_USER_PREFIX)
    ? channel.slice(REALTIME_USER_PREFIX.length)
    : null;
  if (!phone) return;

  let event;
  try {
    event = JSON.parse(message);
  } catch {
    return;
  }

  const set = clientsByPhone.get(normalizeKzPhone(phone));
  if (!set) return;

  for (const client of set) {
    if (event.type === "incoming_call") {
      sendJson(client.ws, event);
      continue;
    }
    if (event.type === "dialog_update") {
      sendJson(client.ws, event);
      continue;
    }
    if (event.type === "envelopes" && event.channel && shouldReceiveChannelEvent(client, event.channel)) {
      sendJson(client.ws, event);
      continue;
    }
    if (event.type === "call_signal" && event.callId) {
      if (client.channels.has(`call:${event.callId}`) || client.channels.has(event.session?.channel ?? "")) {
        sendJson(client.ws, event);
      }
      continue;
    }
    if (event.type === "typing" && event.channel && shouldReceiveChannelEvent(client, event.channel)) {
      sendJson(client.ws, event);
      continue;
    }
    if (event.type === "peer_online") {
      sendJson(client.ws, event);
    }
  }
});

function shouldReceiveChannelEvent(client, channel) {
  return client.channels.has(channel) || client.channels.has("*");
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("qhub realtime websocket (messenger + share)\n");
});

const wss = new WebSocketServer({ noServer: true });
const shareWss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === SHARE_WS_PATH) {
    const participantId = url.searchParams.get("participantId") ?? "";
    const accessToken = url.searchParams.get("accessToken") ?? "";

    shareWss.handleUpgrade(req, socket, head, (ws) => {
      void (async () => {
        const session = await verifyShareParticipant(participantId, accessToken);
        if (!session) {
          ws.close(4401, "auth_failed");
          socket.destroy();
          return;
        }

        /** @type {ShareClientState} */
        const state = {
          ws,
          participantId: session.participantId,
          roomId: session.roomId,
          authed: true,
          lastPong: Date.now(),
        };

        addShareClient(state);
        sendJson(ws, { type: "connected", participantId: state.participantId });

        ws.on("pong", () => {
          state.lastPong = Date.now();
        });

        ws.on("close", () => {
          removeShareClient(state);
        });
      })();
    });
    return;
  }

  if (url.pathname !== WS_PATH) {
    socket.destroy();
    return;
  }

  const queryToken = url.searchParams.get("token");
  const session = authenticateRequest(req, queryToken);

  wss.handleUpgrade(req, socket, head, (ws) => {
    /** @type {ClientState} */
    const state = {
      ws,
      phone: session?.phone ?? "",
      channels: new Set(),
      authed: Boolean(session),
      lastPong: Date.now(),
    };

    if (state.authed) {
      addClient(state);
      sendJson(ws, { type: "connected", phone: state.phone });
    }

    ws.on("message", (raw) => {
      void handleClientMessage(state, raw.toString());
    });

    ws.on("pong", () => {
      state.lastPong = Date.now();
    });

    ws.on("close", () => {
      removeClient(state);
    });
  });
});

async function handleClientMessage(state, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendJson(state.ws, { type: "error", message: "invalid_json" });
    return;
  }

  if (msg.op === "auth" && !state.authed) {
    const token = typeof msg.token === "string" ? msg.token : "";
    const session = token ? verifyMessengerSessionToken(token) : null;
    if (!session) {
      sendJson(state.ws, { type: "error", message: "auth_failed" });
      state.ws.close(4401, "auth_failed");
      return;
    }
    state.phone = session.phone;
    state.authed = true;
    addClient(state);
    sendJson(state.ws, { type: "connected", phone: state.phone });
    return;
  }

  if (!state.authed) {
    sendJson(state.ws, { type: "error", message: "not_authenticated" });
    return;
  }

  if (msg.op === "subscribe" && Array.isArray(msg.channels)) {
    for (const ch of msg.channels) {
      if (typeof ch === "string" && ch.length > 0) {
        state.channels.add(ch);
      }
    }
    return;
  }

  if (msg.op === "unsubscribe" && Array.isArray(msg.channels)) {
    for (const ch of msg.channels) {
      state.channels.delete(ch);
    }
    return;
  }

  if (msg.op === "typing" && typeof msg.channel === "string") {
    const channel = msg.channel;
    const active = msg.active !== false;
    const typingKey = `${TYPING_PREFIX}${channel}:${state.phone}`;
    if (active) {
      await redisData.set(typingKey, "1", "EX", TYPING_TTL_SEC);
    } else {
      await redisData.del(typingKey);
    }
    const peers = await channelParticipants(redisData, channel);
    publishToPhones(
      redisPub,
      peers.filter((p) => p !== state.phone),
      { type: "typing", channel, peerPhone: state.phone, active },
    );
    return;
  }

  if (msg.op === "presence" && typeof msg.channel === "string") {
    const channel = msg.channel;
    const presence = { channel, at: Date.now() };
    await redisData.set(
      `${PRESENCE_PREFIX}${state.phone}`,
      JSON.stringify(presence),
      "EX",
      PRESENCE_TTL_SEC,
    );
    const peers = await channelParticipants(redisData, channel);
    publishToPhones(
      redisPub,
      peers.filter((p) => p !== state.phone),
      {
        type: "peer_online",
        phone: state.phone,
        online: true,
        activeChannel: channel,
      },
    );
    return;
  }

  if (msg.op === "pong") {
    state.lastPong = Date.now();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const set of clientsByPhone.values()) {
    for (const client of set) {
      if (now - client.lastPong > PONG_TIMEOUT_MS) {
        client.ws.terminate();
        removeClient(client);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }
  for (const set of shareClientsByParticipant.values()) {
    for (const client of set) {
      if (now - client.lastPong > PONG_TIMEOUT_MS) {
        client.ws.terminate();
        removeShareClient(client);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }
}, PING_INTERVAL_MS);

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[realtime-ws] listening on 127.0.0.1:${PORT}${WS_PATH} and ${SHARE_WS_PATH}`);
});

process.on("SIGINT", () => {
  wss.close();
  shareWss.close();
  httpServer.close();
  void redisSub.quit();
  void redisPub.quit();
  void redisData.quit();
  process.exit(0);
});
