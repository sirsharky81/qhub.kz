import type { BleLink } from "@/lib/obd/ble-link";
import { Elm327Client } from "@/lib/obd/elm327";

const REMOTE_BLE_STUB: BleLink = {
  info: { id: "remote", name: "Удалённый vLinker", transport: "web-bluetooth" },
  async connect() {},
  async disconnect() {},
  discardInput() {},
  pullPending() {
    return "";
  },
  setDisconnectListener() {},
  async writeLine() {
    throw new Error("Удалённый адаптер принимает только команды мастера");
  },
  async readUntilPrompt() {
    throw new Error("Удалённый адаптер принимает только команды мастера");
  },
};

/**
 * Master's ELM. Every AT/UDS line is executed on the client's vLinker.
 * Responses stay in this object and are not rendered on the client.
 */
export class RemoteElm327 extends Elm327Client {
  private rpcQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly rpc: (command: string, timeoutMs?: number) => Promise<string>) {
    super(REMOTE_BLE_STUB);
  }

  override async sendCommand(
    command: string,
    timeoutMs?: number,
    _options?: { quietMs?: number; allowBarePrompt?: boolean },
  ): Promise<string> {
    const run = this.rpcQueue.then(() => this.rpc(command, timeoutMs));
    this.rpcQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
