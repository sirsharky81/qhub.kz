import { isNativePlatform } from "./runtime";

export interface RemoteFlags {
  enable_background_location?: boolean;
  enable_native_push?: boolean;
}

let remoteFlags: RemoteFlags = {};

export function setRemoteFlags(flags: RemoteFlags): void {
  remoteFlags = flags;
}

export const PlatformFeatures = {
  get locationBackground(): boolean {
    return isNativePlatform() && remoteFlags.enable_background_location !== false;
  },
  get pushNotificationsNative(): boolean {
    return isNativePlatform() && remoteFlags.enable_native_push !== false;
  },
  get camera(): boolean {
    return true;
  },
  get biometrics(): boolean {
    return false;
  },
};
