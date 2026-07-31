import { describe, expect, it } from "vitest";
import { pickShareChunkSize } from "./chunk-size";
import {
  CHUNK_SIZE,
  LAN_CHUNK_SIZE,
  arrayBufferToBase64,
  encodeControlMessage,
  MAX_DC_JSON_MESSAGE_LENGTH,
} from "./transfer-protocol";

describe("transfer protocol chunk limits", () => {
  it("keeps encoded chunk messages under WebRTC size limit", () => {
    const payload = arrayBufferToBase64(new Uint8Array(CHUNK_SIZE).buffer);
    const raw = encodeControlMessage({
      t: "file-chunk",
      transferId: "transfer-id",
      fileId: "file-id",
      offset: 0,
      data: payload,
    });
    expect(raw.length).toBeLessThan(MAX_DC_JSON_MESSAGE_LENGTH);
  });

  it("uses larger LAN chunks when safe", () => {
    expect(pickShareChunkSize(true)).toBe(LAN_CHUNK_SIZE);
    expect(pickShareChunkSize(false)).toBe(CHUNK_SIZE);
  });
});
