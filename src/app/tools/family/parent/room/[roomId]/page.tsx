import { ParentRoomClient } from "./ParentRoomClient";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function ParentRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <ParentRoomClient roomId={roomId} />;
}
