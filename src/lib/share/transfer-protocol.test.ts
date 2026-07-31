import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  MAX_DC_JSON_MESSAGE_LENGTH,
  arrayBufferToBase64,
  encodeControlMessage,
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
});
