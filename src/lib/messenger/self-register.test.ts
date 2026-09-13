import { afterEach, describe, expect, it } from "vitest";
import { MESSENGER_SELF_ADDED_BY, REDIS_WHITELIST_KEY } from "./constants";
import { redisDel } from "./redis";
import {
  ensureSelfRegisteredWhitelist,
  getWhitelistEntry,
  loadWhitelist,
  saveWhitelist,
} from "./store";

const phone = "+77018880001";

afterEach(async () => {
  const all = await loadWhitelist();
  delete all[phone];
  if (Object.keys(all).length === 0) {
    await redisDel(REDIS_WHITELIST_KEY);
    await saveWhitelist({});
    return;
  }
  await saveWhitelist(all);
});

describe("ensureSelfRegisteredWhitelist", () => {
  it("adds a number with extras off", async () => {
    const entry = await ensureSelfRegisteredWhitelist(phone);
    expect(entry).toMatchObject({
      phone,
      addedBy: MESSENGER_SELF_ADDED_BY,
      status: "active",
      verified: true,
      vpnEnabled: false,
      musicEnabled: false,
      sendEnabled: false,
    });
    expect(await getWhitelistEntry(phone)).toEqual(entry);
  });

  it("does not overwrite admin flags", async () => {
    await saveWhitelist({
      ...(await loadWhitelist()),
      [phone]: {
        phone,
        addedBy: "admin@qhub.kz",
        addedAt: 1,
        status: "active",
        vpnEnabled: true,
        musicEnabled: true,
        sendEnabled: true,
      },
    });

    const entry = await ensureSelfRegisteredWhitelist(phone);
    expect(entry.addedBy).toBe("admin@qhub.kz");
    expect(entry.vpnEnabled).toBe(true);
    expect(entry.musicEnabled).toBe(true);
    expect(entry.sendEnabled).toBe(true);
  });

  it("does not reactivate a blocked number", async () => {
    await saveWhitelist({
      ...(await loadWhitelist()),
      [phone]: {
        phone,
        addedBy: "admin@qhub.kz",
        addedAt: 1,
        status: "blocked",
        vpnEnabled: false,
        musicEnabled: false,
        sendEnabled: false,
      },
    });

    const entry = await ensureSelfRegisteredWhitelist(phone);
    expect(entry.status).toBe("blocked");
    expect(entry.addedBy).toBe("admin@qhub.kz");
  });
});

