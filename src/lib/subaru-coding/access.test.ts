import { afterEach, describe, expect, it } from "vitest";
import { redisDel } from "@/lib/messenger/redis";
import {
  SUBARU_CODING_WHITELIST_KEY,
  clearSubaruCodingWhitelistCache,
  isSubaruCodingPhoneAllowed,
  loadSubaruCodingWhitelist,
  saveSubaruCodingWhitelist,
} from "./access";

const phone = "+77071234567";

afterEach(async () => {
  clearSubaruCodingWhitelistCache();
  await redisDel(SUBARU_CODING_WHITELIST_KEY);
  clearSubaruCodingWhitelistCache();
});

describe("subaru coding phone whitelist", () => {
  it("denies every number while the list is empty", async () => {
    expect(await isSubaruCodingPhoneAllowed(phone)).toBe(false);
    expect(await isSubaruCodingPhoneAllowed("+77070000000")).toBe(false);
  });

  it("allows only an active entry and keeps blocked numbers out", async () => {
    await saveSubaruCodingWhitelist({
      [phone]: {
        phone,
        addedBy: "admin@qhub.kz",
        addedAt: 1,
        status: "active",
        note: "мастер",
      },
    });
    expect(await isSubaruCodingPhoneAllowed("8 707 123 45 67")).toBe(true);
    expect(await isSubaruCodingPhoneAllowed("+77070000000")).toBe(false);

    const all = await loadSubaruCodingWhitelist();
    all[phone] = { ...all[phone]!, status: "blocked" };
    await saveSubaruCodingWhitelist(all);
    expect(await isSubaruCodingPhoneAllowed(phone)).toBe(false);
  });
});
