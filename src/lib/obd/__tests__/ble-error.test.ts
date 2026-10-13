import { describe, expect, it } from "vitest";
import {
  formatBleFailure,
  isNumericBleFailure,
  looksLikeObdAdapterName,
  preferWriteWithoutResponse,
} from "../ble-error";

describe("formatBleFailure", () => {
  it("explains Bluefy numeric status 2", () => {
    const text = formatBleFailure(2);
    expect(text).toContain("код 2");
    expect(text).not.toBe("2");
  });

  it("explains an object whose message is only the status code", () => {
    expect(formatBleFailure({ code: 2, message: "2" })).toContain("код 2");
  });

  it("keeps ELM timeout text", () => {
    expect(formatBleFailure(new Error("Таймаут ELM — нет ответа от адаптера"))).toBe(
      "Таймаут ELM — нет ответа от адаптера",
    );
  });
});

describe("isNumericBleFailure", () => {
  it("detects a bare number and a numeric message", () => {
    expect(isNumericBleFailure(2)).toBe(true);
    expect(isNumericBleFailure({ message: "2" })).toBe(true);
    expect(isNumericBleFailure(new Error("Таймаут ELM"))).toBe(false);
  });
});

describe("preferWriteWithoutResponse", () => {
  it("uses write-without-response for vLinker on Bluefy", () => {
    expect(preferWriteWithoutResponse(undefined, true)).toBe(true);
    expect(preferWriteWithoutResponse({ writeWithoutResponse: true, write: true }, true)).toBe(true);
    expect(preferWriteWithoutResponse({ write: true }, false)).toBe(false);
    expect(preferWriteWithoutResponse({ writeWithoutResponse: true, write: false }, false)).toBe(true);
  });
});

describe("looksLikeObdAdapterName", () => {
  it("matches vLinker advertising names", () => {
    expect(looksLikeObdAdapterName("vLinker MC-IOS")).toBe(true);
    expect(looksLikeObdAdapterName("OBDII")).toBe(true);
    expect(looksLikeObdAdapterName("Headphones")).toBe(false);
  });
});
