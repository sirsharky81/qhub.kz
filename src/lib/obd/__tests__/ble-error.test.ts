import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatBleFailure,
  isNumericBleFailure,
  looksLikeObdAdapterName,
  preferWriteWithoutResponse,
} from "../ble-error";
import {
  ELM_BLE_OPTIONAL_SERVICES,
  ISSC_UART_NOTIFY,
  ISSC_UART_SERVICE,
  ISSC_UART_WRITE,
  VGATE_18F0_SERVICE,
  VGATE_2AF0_NOTIFY,
  VGATE_2AF1_WRITE,
} from "../vlinker-uuids";
import { WebBleLink, bindSerial } from "../web-ble-link";

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

describe("vLinker MC-IOS on Android Chrome Web Bluetooth", () => {
  it("includes Vgate 0x18F0 and Microchip ISSC UART services in ELM_BLE_OPTIONAL_SERVICES", () => {
    expect(ELM_BLE_OPTIONAL_SERVICES).toContain(VGATE_18F0_SERVICE);
    expect(ELM_BLE_OPTIONAL_SERVICES).toContain(ISSC_UART_SERVICE);
  });

  it("binds serial over Vgate 0x18F0 (0x2AF0 notify + 0x2AF1 write) when Chrome blocks unrequested services", async () => {
    const notifyChar = {
      uuid: VGATE_2AF0_NOTIFY,
      properties: { notify: true },
      startNotifications: async () => notifyChar,
      stopNotifications: async () => notifyChar,
      writeValue: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const writeChar = {
      uuid: VGATE_2AF1_WRITE,
      properties: { write: true, writeWithoutResponse: true },
      startNotifications: async () => writeChar,
      stopNotifications: async () => writeChar,
      writeValue: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const service18f0 = {
      uuid: VGATE_18F0_SERVICE,
      getCharacteristic: async (uuid: string) => {
        if (uuid === VGATE_2AF0_NOTIFY || uuid === "2af0") return notifyChar;
        if (uuid === VGATE_2AF1_WRITE || uuid === "2af1") return writeChar;
        throw new Error(`Characteristic ${uuid} not found`);
      },
    };
    const server = {
      connected: true,
      connect: async () => server,
      disconnect: () => {},
      getPrimaryService: async (uuid: string) => {
        if (
          ELM_BLE_OPTIONAL_SERVICES.includes(uuid as (typeof ELM_BLE_OPTIONAL_SERVICES)[number]) &&
          (uuid === VGATE_18F0_SERVICE || uuid === "18f0")
        ) {
          return service18f0;
        }
        throw new Error(`No service ${uuid}`);
      },
    };

    const bound = await bindSerial(server);
    expect(bound.notify).toBe(notifyChar);
    expect(bound.write).toBe(writeChar);
  });

  it("binds serial over Microchip ISSC UART (49535343-fe7d-...) on vLinker MC-IOS", async () => {
    const notifyChar = {
      uuid: ISSC_UART_NOTIFY,
      properties: { notify: true },
      startNotifications: async () => notifyChar,
      stopNotifications: async () => notifyChar,
      writeValue: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const writeChar = {
      uuid: ISSC_UART_WRITE,
      properties: { write: true, writeWithoutResponse: true },
      startNotifications: async () => writeChar,
      stopNotifications: async () => writeChar,
      writeValue: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const isscService = {
      uuid: ISSC_UART_SERVICE,
      getCharacteristic: async (uuid: string) => {
        if (uuid === ISSC_UART_NOTIFY) return notifyChar;
        if (uuid === ISSC_UART_WRITE) return writeChar;
        throw new Error(`Characteristic ${uuid} not found`);
      },
    };
    const server = {
      connected: true,
      connect: async () => server,
      disconnect: () => {},
      getPrimaryService: async (uuid: string) => {
        if (
          ELM_BLE_OPTIONAL_SERVICES.includes(uuid as (typeof ELM_BLE_OPTIONAL_SERVICES)[number]) &&
          uuid === ISSC_UART_SERVICE
        ) {
          return isscService;
        }
        throw new Error(`No service ${uuid}`);
      },
    };

    const bound = await bindSerial(server);
    expect(bound.notify).toBe(notifyChar);
    expect(bound.write).toBe(writeChar);
  });

  describe("WebBleLink single-chunk writeWithoutResponse fast-path on Android Chrome", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("uses writeValueWithoutResponse for <=20-byte CAN frames on Android Chrome and keeps writeValueWithResponse for multi-chunk commands", async () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      });
      const calls: string[] = [];
      const notifyChar = {
        uuid: VGATE_2AF0_NOTIFY,
        properties: { notify: true },
        startNotifications: async () => notifyChar,
        stopNotifications: async () => notifyChar,
        writeValue: async () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const writeChar = {
        uuid: VGATE_2AF1_WRITE,
        properties: { write: true, writeWithoutResponse: true },
        startNotifications: async () => writeChar,
        stopNotifications: async () => writeChar,
        writeValue: async () => {
          calls.push("writeValue");
        },
        writeValueWithResponse: async () => {
          calls.push("withResponse");
        },
        writeValueWithoutResponse: async () => {
          calls.push("withoutResponse");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const svc = {
        uuid: VGATE_18F0_SERVICE,
        getCharacteristic: async (uuid: string) => {
          if (uuid === VGATE_2AF0_NOTIFY || uuid === "2af0") return notifyChar;
          if (uuid === VGATE_2AF1_WRITE || uuid === "2af1") return writeChar;
          throw new Error(`Characteristic ${uuid} not found`);
        },
      };
      const server = {
        connected: true,
        connect: async () => server,
        disconnect: () => {},
        getPrimaryService: async (uuid: string) => {
          if (uuid === VGATE_18F0_SERVICE || uuid === "18f0") return svc;
          throw new Error(`No service ${uuid}`);
        },
      };

      const link = new WebBleLink(
        { id: "vlinker-1", name: "vLinker MC-IOS", transport: "web-bluetooth" },
        { id: "vlinker-1", name: "vLinker MC-IOS", gatt: server },
      );
      await link.connect();

      // Single 17-byte CAN frame (<= 20 bytes) uses fast writeValueWithoutResponse
      await link.writeLine("2100112233445566");
      expect(calls).toEqual(["withoutResponse"]);

      // Multi-chunk (> 20 bytes) keeps paced writeValueWithResponse on Android Chrome
      calls.length = 0;
      await link.writeLine("3BB0" + "22".repeat(20));
      expect(calls.every((c) => c === "withResponse")).toBe(true);
      expect(calls.length).toBeGreaterThan(1);
    });
  });
});
