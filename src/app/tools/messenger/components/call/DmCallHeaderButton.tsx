"use client";

import { CallButton } from "./CallButton";
import { useCallButtonProps } from "./CallProvider";

export function DmCallHeaderButton({ peerOnline }: { peerOnline: boolean | null }) {
  const props = useCallButtonProps(peerOnline);
  return (
    <div className="flex items-center gap-1">
      <CallButton
        disabled={props.disabled}
        disabledReason={props.disabledReason}
        inCall={props.inCall}
        onCall={props.onAudioCall}
        mode="audio"
      />
      <CallButton
        disabled={props.disabled}
        disabledReason={props.disabledReason}
        inCall={props.inCall}
        onCall={props.onVideoCall}
        mode="video"
      />
    </div>
  );
}
