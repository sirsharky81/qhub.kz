import { CHUNK_SIZE, LAN_CHUNK_SIZE, arrayBufferToBase64, encodeControlMessage, MAX_DC_JSON_MESSAGE_LENGTH } from "./transfer-protocol";

export function pickShareChunkSize(lanPrefer?: boolean): number {
  if (!lanPrefer) return CHUNK_SIZE;
  const probe = encodeControlMessage({
    t: "file-chunk",
    transferId: "x",
    fileId: "y",
    offset: 0,
    data: arrayBufferToBase64(new Uint8Array(LAN_CHUNK_SIZE).buffer),
  });
  return probe.length <= MAX_DC_JSON_MESSAGE_LENGTH ? LAN_CHUNK_SIZE : CHUNK_SIZE;
}
