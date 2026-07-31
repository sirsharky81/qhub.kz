import { createRoomCoreRedis, type RoomCoreRedis } from "./redis";
import {
  generateAccessToken,
  generateInviteToken,
  generateParticipantId as generateMemberId,
  generateRoomCode,
  generateUuidV7,
  hashToken,
  normalizeInviteToken,
  normalizeRoomCodeInput,
} from "./tokens";
import type {
  RoomCoreCreateResult,
  RoomCoreJoinResult,
  RoomCoreMember,
  RoomCoreRoom,
  RoomCoreRoomPublic,
  RoomCoreServiceConfig,
  RoomCoreSnapshot,
} from "./types";

function roomKey(prefix: string, roomId: string): string {
  return `${prefix}room:${roomId}`;
}

function memberKey(prefix: string, memberId: string): string {
  return `${prefix}member:${memberId}`;
}

function inviteKey(prefix: string, tokenHash: string): string {
  return `${prefix}invite:${tokenHash}`;
}

function codeKey(prefix: string, code: string): string {
  return `${prefix}code:${normalizeRoomCodeInput(code)}`;
}

export class RoomCoreEngine {
  private redis: RoomCoreRedis;

  constructor(private config: RoomCoreServiceConfig) {
    this.redis = createRoomCoreRedis(config.redisPrefix);
  }

  private ttlSec(): number {
    return this.config.ttlSec;
  }

  async getRoom(roomId: string): Promise<RoomCoreRoom | null> {
    return this.redis.getJson<RoomCoreRoom>(roomKey(this.config.redisPrefix, roomId));
  }

  async getMember(memberId: string): Promise<RoomCoreMember | null> {
    return this.redis.getJson<RoomCoreMember>(memberKey(this.config.redisPrefix, memberId));
  }

  async verifyMember(memberId: string, accessToken: string): Promise<RoomCoreMember | null> {
    const member = await this.getMember(memberId);
    if (!member || member.left) return null;
    if (member.tokenHash !== hashToken(accessToken)) return null;
    return member;
  }

  private async saveRoom(room: RoomCoreRoom): Promise<void> {
    room.version += 1;
    await this.redis.set(
      roomKey(this.config.redisPrefix, room.roomId),
      JSON.stringify(room),
      this.ttlSec(),
    );
  }

  private async saveMember(member: RoomCoreMember): Promise<void> {
    member.lastSeen = Date.now();
    await this.redis.set(
      memberKey(this.config.redisPrefix, member.memberId),
      JSON.stringify(member),
      this.ttlSec(),
    );
  }

  private async uniqueRoomCode(): Promise<string> {
    for (let i = 0; i < 12; i += 1) {
      const code = generateRoomCode();
      const existing = await this.redis.getJson<string>(codeKey(this.config.redisPrefix, code));
      if (!existing) return code;
    }
    throw new Error("code_collision");
  }

  async createRoom(displayName: string, pin?: string | null): Promise<RoomCoreCreateResult> {
    const roomId = generateUuidV7();
    const inviteToken = generateInviteToken();
    const roomCode = await this.uniqueRoomCode();
    const memberId = generateMemberId();
    const accessToken = generateAccessToken();
    const now = Date.now();

    const room: RoomCoreRoom = {
      roomId,
      serviceId: this.config.serviceId,
      roomCode,
      inviteTokenHash: hashToken(inviteToken),
      createdAt: now,
      expiresAt: now + this.ttlSec() * 1000,
      ownerMemberId: memberId,
      memberIds: [memberId],
      maxMembers: this.config.maxMembers,
      closed: false,
      version: 0,
      pinHash: pin?.trim() ? hashToken(pin.trim()) : null,
    };

    const member: RoomCoreMember = {
      memberId,
      roomId,
      displayName: displayName.trim() || "Устройство",
      role: this.config.ownerRole,
      tokenHash: hashToken(accessToken),
      joinedAt: now,
      lastSeen: now,
      left: false,
    };

    await this.redis.set(
      roomKey(this.config.redisPrefix, roomId),
      JSON.stringify(room),
      this.ttlSec(),
    );
    await this.redis.set(
      inviteKey(this.config.redisPrefix, room.inviteTokenHash),
      JSON.stringify(roomId),
      this.ttlSec(),
    );
    await this.redis.set(
      codeKey(this.config.redisPrefix, roomCode),
      JSON.stringify(roomId),
      this.ttlSec(),
    );
    await this.saveMember(member);

    return { room, member, accessToken, inviteToken };
  }

  async resolveRoomByJoinInput(input: string): Promise<RoomCoreRoom | null> {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        const token = url.searchParams.get("t")?.trim();
        if (token) return this.resolveRoomByInviteToken(token);
      } catch {
        /* fall through */
      }
    }

    if (/^[a-f0-9]{32}$/i.test(trimmed)) {
      return this.resolveRoomByInviteToken(trimmed);
    }
    return this.resolveRoomByCode(trimmed);
  }

  async resolveRoomByInviteToken(token: string): Promise<RoomCoreRoom | null> {
    const normalized = normalizeInviteToken(token);
    const roomId = await this.redis.getJson<string>(
      inviteKey(this.config.redisPrefix, hashToken(normalized)),
    );
    if (!roomId) return null;
    return this.getRoom(roomId);
  }

  async resolveRoomByCode(code: string): Promise<RoomCoreRoom | null> {
    const roomId = await this.redis.getJson<string>(codeKey(this.config.redisPrefix, code));
    if (!roomId) return null;
    return this.getRoom(roomId);
  }

  async joinRoom(joinInput: string, displayName: string, pin?: string | null): Promise<RoomCoreJoinResult> {
    const room = await this.resolveRoomByJoinInput(joinInput);
    if (!room || room.closed) throw new Error("room_not_found");
    if (Date.now() > room.expiresAt) throw new Error("room_expired");
    if (room.memberIds.length >= room.maxMembers) throw new Error("room_full");

    if (room.pinHash) {
      const provided = pin?.trim() ?? "";
      if (!provided || hashToken(provided) !== room.pinHash) {
        throw new Error("pin_invalid");
      }
    }

    const memberId = generateMemberId();
    const accessToken = generateAccessToken();
    const now = Date.now();

    const member: RoomCoreMember = {
      memberId,
      roomId: room.roomId,
      displayName: displayName.trim() || "Устройство",
      role: this.config.memberRole,
      tokenHash: hashToken(accessToken),
      joinedAt: now,
      lastSeen: now,
      left: false,
    };

    room.memberIds.push(memberId);
    await this.saveRoom(room);
    await this.saveMember(member);

    await this.publishRoomEvent(room.roomId, {
      type: "member_joined",
      memberId,
      displayName: member.displayName,
      role: member.role,
    });

    return { room, member, accessToken };
  }

  async leaveRoom(memberId: string): Promise<void> {
    const member = await this.getMember(memberId);
    if (!member) return;

    member.left = true;
    await this.saveMember(member);

    const room = await this.getRoom(member.roomId);
    if (!room) return;

    const activeMembers: RoomCoreMember[] = [];
    for (const id of room.memberIds) {
      const m = await this.getMember(id);
      if (m && !m.left) activeMembers.push(m);
    }

    if (activeMembers.length === 0) {
      room.closed = true;
      await this.redis.del(roomKey(this.config.redisPrefix, room.roomId));
      await this.redis.del(
        inviteKey(this.config.redisPrefix, room.inviteTokenHash),
        codeKey(this.config.redisPrefix, room.roomCode),
      );
      for (const id of room.memberIds) {
        await this.redis.del(memberKey(this.config.redisPrefix, id));
      }
    }

    await this.publishRoomEvent(room.roomId, { type: "member_left", memberId });
  }

  async buildRoomPublic(room: RoomCoreRoom): Promise<RoomCoreRoomPublic> {
    const owner = await this.getMember(room.ownerMemberId);
    const activeCount = (
      await Promise.all(room.memberIds.map((id) => this.getMember(id)))
    ).filter((m) => m && !m.left).length;

    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      ownerDisplayName: owner?.displayName ?? "Хост",
      memberCount: activeCount,
      maxMembers: room.maxMembers,
      full: activeCount >= room.maxMembers,
      closed: room.closed,
      expiresAt: room.expiresAt,
      version: room.version,
    };
  }

  async buildSnapshot(viewerMemberId?: string): Promise<RoomCoreSnapshot | null> {
    const viewer = viewerMemberId ? await this.getMember(viewerMemberId) : null;
    if (viewerMemberId && (!viewer || viewer.left)) return null;

    const room = viewer ? await this.getRoom(viewer.roomId) : null;
    if (!room || room.closed) return null;

    if (viewer) {
      viewer.lastSeen = Date.now();
      await this.saveMember(viewer);
    }

    const members: RoomCoreSnapshot["members"] = [];
    for (const id of room.memberIds) {
      const m = await this.getMember(id);
      if (!m || m.left) continue;
      members.push({ memberId: m.memberId, displayName: m.displayName, role: m.role });
    }

    return {
      room: await this.buildRoomPublic(room),
      members,
      self: viewer ?? undefined,
    };
  }

  async touchMember(memberId: string): Promise<void> {
    const member = await this.getMember(memberId);
    if (!member) return;
    await this.saveMember(member);
  }

  roomChannel(roomId: string): string {
    return `qhub:room-core:${this.config.serviceId}:room:${roomId}`;
  }

  participantChannel(participantId: string): string {
    return `qhub:room-core:${this.config.serviceId}:participant:${participantId}`;
  }

  async publishRoomEvent(roomId: string, event: Record<string, unknown>): Promise<void> {
    const payload = JSON.stringify({ ...event, roomId, serviceId: this.config.serviceId, at: Date.now() });
    await this.redis.publish(this.roomChannel(roomId), payload);

    const room = await this.getRoom(roomId);
    if (!room) return;
    for (const memberId of room.memberIds) {
      await this.redis.publish(this.participantChannel(memberId), payload);
    }
  }
}

import { SHARE_ROOM_CONFIG } from "./config";

export function createShareRoomEngine(): RoomCoreEngine {
  return new RoomCoreEngine(SHARE_ROOM_CONFIG);
}
