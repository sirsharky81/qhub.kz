import type { CallAudioPlugin } from "./call-audio";

/** No-op web implementation — browser routing is handled in peer-connection. */
export class CallAudioWeb implements CallAudioPlugin {
  async prepare(): Promise<void> {}

  async setSpeaker(_options: { enabled: boolean }): Promise<void> {}

  async release(): Promise<void> {}
}
