export type ConnectionMode = "p2p" | "turn" | "unknown";

export interface ConnectionDiagnostics {
  mode: ConnectionMode;
  localAddress?: string;
  remoteAddress?: string;
  rttMs?: number;
  outboundMbps?: number;
  candidateType?: string;
}

export async function collectConnectionDiagnostics(
  pc: RTCPeerConnection | null,
): Promise<ConnectionDiagnostics> {
  if (!pc) return { mode: "unknown" };

  try {
    const stats = await pc.getStats();
    let mode: ConnectionMode = "unknown";
    let localAddress: string | undefined;
    let remoteAddress: string | undefined;
    let rttMs: number | undefined;
    let outboundMbps: number | undefined;
    let candidateType: string | undefined;

    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.state === "succeeded") {
        const local = stats.get(report.localCandidateId as string);
        const remote = stats.get(report.remoteCandidateId as string);
        if (local && "candidateType" in local) {
          candidateType = String(local.candidateType);
          if (candidateType === "host") mode = "p2p";
          else if (candidateType === "relay") mode = "turn";
          else if (mode === "unknown") mode = "p2p";
        }
        if (local && "address" in local && local.address) {
          localAddress = String(local.address);
        }
        if (remote && "address" in remote && remote.address) {
          remoteAddress = String(remote.address);
        }
        if (typeof report.currentRoundTripTime === "number") {
          rttMs = Math.round(report.currentRoundTripTime * 1000);
        }
      }
      if (report.type === "outbound-rtp" && report.kind === "data") {
        if (typeof report.bytesSent === "number" && typeof report.timestamp === "number") {
          outboundMbps = report.bytesSent / 125000;
        }
      }
    });

    return { mode, localAddress, remoteAddress, rttMs, outboundMbps, candidateType };
  } catch {
    return { mode: "unknown" };
  }
}

export function diagnosticsLabel(d: ConnectionDiagnostics): string {
  if (d.mode === "p2p") return "P2P (локальная сеть или прямое соединение)";
  if (d.mode === "turn") return "TURN relay";
  return "Определяется…";
}
