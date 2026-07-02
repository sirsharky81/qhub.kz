"use client";

import { CallButton } from "./CallButton";
import { useCallButtonProps } from "./CallProvider";

export function DmCallHeaderButton({ peerOnline }: { peerOnline: boolean | null }) {
  const props = useCallButtonProps(peerOnline);
  return <CallButton {...props} />;
}
