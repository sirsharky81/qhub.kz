import type { RepeatMode, Track } from "./types";

export class QueueManager {
  private queue: string[] = [];
  private index = -1;
  private shuffle = false;
  private repeat: RepeatMode = "none";
  private shuffleOrder: string[] = [];

  setQueue(trackIds: string[], startIndex = 0): void {
    this.queue = [...trackIds];
    this.index = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    this.rebuildShuffleOrder();
  }

  getQueue(): string[] {
    return [...this.queue];
  }

  getIndex(): number {
    return this.index;
  }

  getCurrentId(): string | null {
    if (this.index < 0 || this.index >= this.queue.length) return null;
    return this.queue[this.index];
  }

  setShuffle(enabled: boolean): void {
    this.shuffle = enabled;
    this.rebuildShuffleOrder();
  }

  isShuffle(): boolean {
    return this.shuffle;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
  }

  getRepeat(): RepeatMode {
    return this.repeat;
  }

  cycleRepeat(): RepeatMode {
    const modes: RepeatMode[] = ["none", "all", "one"];
    const idx = modes.indexOf(this.repeat);
    this.repeat = modes[(idx + 1) % modes.length];
    return this.repeat;
  }

  addToQueue(trackId: string): void {
    this.queue.push(trackId);
    if (this.index < 0) this.index = 0;
    this.rebuildShuffleOrder();
  }

  addNext(trackId: string): void {
    if (this.index < 0) {
      this.queue.push(trackId);
      this.index = 0;
    } else {
      this.queue.splice(this.index + 1, 0, trackId);
    }
    this.rebuildShuffleOrder();
  }

  removeFromQueue(trackId: string): void {
    const idx = this.queue.indexOf(trackId);
    if (idx === -1) return;
    this.queue.splice(idx, 1);
    if (idx < this.index) this.index--;
    else if (idx === this.index && this.index >= this.queue.length) {
      this.index = this.queue.length - 1;
    }
    this.rebuildShuffleOrder();
  }

  playTrack(trackId: string, allTrackIds?: string[]): void {
    if (allTrackIds) {
      this.setQueue(allTrackIds, allTrackIds.indexOf(trackId));
    } else {
      const idx = this.queue.indexOf(trackId);
      if (idx >= 0) {
        this.index = idx;
      } else {
        this.queue = [trackId];
        this.index = 0;
      }
    }
    this.rebuildShuffleOrder();
  }

  next(): string | null {
    if (this.queue.length === 0) return null;
    if (this.repeat === "one") return this.getCurrentId();

    if (this.shuffle && this.shuffleOrder.length > 0) {
      const pos = this.shuffleOrder.indexOf(this.queue[this.index]);
      if (pos < this.shuffleOrder.length - 1) {
        this.index = this.queue.indexOf(this.shuffleOrder[pos + 1]);
      } else if (this.repeat === "all") {
        this.index = this.queue.indexOf(this.shuffleOrder[0]);
      } else {
        return null;
      }
    } else {
      if (this.index < this.queue.length - 1) {
        this.index++;
      } else if (this.repeat === "all") {
        this.index = 0;
      } else {
        return null;
      }
    }
    return this.getCurrentId();
  }

  previous(): string | null {
    if (this.queue.length === 0) return null;

    if (this.shuffle && this.shuffleOrder.length > 0) {
      const pos = this.shuffleOrder.indexOf(this.queue[this.index]);
      if (pos > 0) {
        this.index = this.queue.indexOf(this.shuffleOrder[pos - 1]);
      } else if (this.repeat === "all") {
        this.index = this.queue.indexOf(this.shuffleOrder[this.shuffleOrder.length - 1]);
      } else {
        this.index = 0;
      }
    } else {
      if (this.index > 0) {
        this.index--;
      } else if (this.repeat === "all") {
        this.index = this.queue.length - 1;
      } else {
        this.index = 0;
      }
    }
    return this.getCurrentId();
  }

  playAllFromTracks(tracks: Track[], startTrackId?: string): void {
    const ids = tracks.map((t) => t.id);
    const startIdx = startTrackId ? ids.indexOf(startTrackId) : 0;
    this.setQueue(ids, Math.max(0, startIdx));
  }

  private rebuildShuffleOrder(): void {
    if (!this.shuffle || this.queue.length === 0) {
      this.shuffleOrder = [];
      return;
    }
    const current = this.getCurrentId();
    const rest = this.queue.filter((id) => id !== current);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.shuffleOrder = current ? [current, ...rest] : rest;
  }

  toState(): { queue: string[]; queueIndex: number } {
    return { queue: this.getQueue(), queueIndex: this.index };
  }

  fromState(queue: string[], queueIndex: number): void {
    this.queue = [...queue];
    this.index = queue.length === 0 ? -1 : Math.max(0, Math.min(queueIndex, queue.length - 1));
    this.rebuildShuffleOrder();
  }

  clear(): void {
    this.queue = [];
    this.index = -1;
    this.shuffleOrder = [];
  }
}
