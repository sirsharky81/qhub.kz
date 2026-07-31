import { describe, expect, it, beforeEach } from "vitest";
import { RoomCoreEngine } from "./engine";
import { SHARE_ROOM_CONFIG } from "./config";

describe("room-core engine", () => {
  let engine: RoomCoreEngine;

  beforeEach(() => {
    engine = new RoomCoreEngine(SHARE_ROOM_CONFIG);
  });

  it("creates and joins a room", async () => {
    const created = await engine.createRoom("Host Device");
    expect(created.room.roomCode.length).toBeGreaterThan(5);
    expect(created.inviteToken).toHaveLength(32);

    const joined = await engine.joinRoom(created.inviteToken, "Guest Device");
    expect(joined.member.role).toBe("guest");
    expect(joined.room.memberIds).toHaveLength(2);

    const snapshot = await engine.buildSnapshot(joined.member.memberId);
    expect(snapshot?.members).toHaveLength(2);
  });

  it("rejects third participant", async () => {
    const { inviteToken } = await engine.createRoom("A");
    await engine.joinRoom(inviteToken, "B");
    await expect(engine.joinRoom(inviteToken, "C")).rejects.toThrow("room_full");
  });
});
