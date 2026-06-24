import { ParentMapPageClient } from "./ParentMapPageClient";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function ParentMapPage({ params }: Props) {
  const { roomId } = await params;
  return <ParentMapPageClient roomId={roomId} />;
}
