import { afterEach, describe, expect, it } from "vitest";
import {
  clearMessengerPresence,
  getMessengerPresence,
  isMessengerTyping,
  isMessengerOnline,
  isViewingChannel,
  setMessengerTyping,
  setMessengerGlobalPresence,
  setMessengerPresence,
} from "./push-store";
import { REDIS_MESSENGER_PRESENCE_PREFIX } from "./constants";
import { normalizeKzPhone } from "./phone";
import { redisSet } from "./redis";

function presenceKey(phone: string): string {
  return `${REDIS_MESSENGER_PRESENCE_PREFIX}${normalizeKzPhone(phone)}`;
}

describe("messenger presence", () => {
  const phone = "+77022220001";
  const channel = "dm:+77022220001:+77022220002";

  afterEach(async () => {
    await clearMessengerPresence(phone);
  });

  it("marks user online while viewing specific channel", async () => {
    await setMessengerPresence(phone, channel);
    const presence = await getMessengerPresence(phone);
    expect(presence?.channel).toBe(channel);
    expect(isMessengerOnline(presence)).toBe(true);
    expect(isViewingChannel(presence, channel)).toBe(true);
  });

  it("sets global presence on home heartbeat", async () => {
    await setMessengerGlobalPresence(phone);
    const presence = await getMessengerPresence(phone);
    expect(presence?.channel).toBe("__global__");
    expect(isMessengerOnline(presence)).toBe(true);
    expect(isViewingChannel(presence, channel)).toBe(false);
  });

  it("treats stale presence as offline", async () => {
    const staleAt = Date.now() - 120_000;
    await redisSet(
      presenceKey(phone),
      JSON.stringify({
        channel,
        at: staleAt,
      }),
    );

    const presence = await getMessengerPresence(phone);
    expect(isMessengerOnline(presence)).toBe(false);
    expect(isViewingChannel(presence, channel)).toBe(false);
  });

  it("stores ephemeral typing signal by channel", async () => {
    const peer = "+77022220002";
    await setMessengerTyping(channel, peer, true);
    expect(await isMessengerTyping(channel, peer)).toBe(true);
    await setMessengerTyping(channel, peer, false);
    expect(await isMessengerTyping(channel, peer)).toBe(false);
  });
});
