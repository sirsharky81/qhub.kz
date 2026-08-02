export type AutoslalomMode = "A" | "B";

export type AutoslalomPhase = "idle" | "playing" | "crash" | "gameover" | "clock";

export type Lane = 0 | 1 | 2;

export interface Barrier {
  id: number;
  y: number;
  /** Lanes blocked by this barrier row (1–2 lanes). */
  lanes: Lane[];
  scored: boolean;
}

export interface ClockSettings {
  hours: number;
  minutes: number;
  alarmHours: number;
  alarmMinutes: number;
  alarmEnabled: boolean;
}

export interface AutoslalomState {
  phase: AutoslalomPhase;
  mode: AutoslalomMode;
  score: number;
  lives: number;
  maxLives: number;
  carLane: Lane;
  speedLevel: number;
  barriers: Barrier[];
  distance: number;
  nextBarrierId: number;
  /** Milliseconds until next barrier spawn. */
  spawnTimer: number;
  /** Score milestones that already granted an extra life. */
  awardedMilestones: number[];
  /** Brief invulnerability after crash. */
  invulnerableMs: number;
  /** Timestamp of last steer for double-tap detection (Game B). */
  lastSteerAt: number;
  lastSteerDir: "left" | "right" | null;
  /** Show high score while start button is held. */
  showHighScore: boolean;
  clock: ClockSettings;
  /** Clock sub-mode: normal display or setting time/alarm. */
  clockEdit: "none" | "time" | "alarm";
  startedAt: number;
}

export type SteerDirection = "left" | "right";

export interface AutoslalomHighScores {
  A: number;
  B: number;
}

export interface AutoslalomPersisted {
  highScores: AutoslalomHighScores;
  clock: ClockSettings;
  speedLevel: number;
  mode: AutoslalomMode;
}
