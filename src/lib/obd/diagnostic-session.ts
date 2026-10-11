/** @deprecated Use ObdBleSession from ./obd-session */
export {
  ObdBleSession as DiagnosticSession,
  type ObdConnectionPhase as DiagnosticPhase,
  type LivePidReading,
  type VehicleLinkState,
} from "./obd-session";
