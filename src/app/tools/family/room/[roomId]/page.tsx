import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function LegacyRoomRedirect({ params }: Props) {
  const { roomId } = await params;
  redirect(`/tools/family/parent/room/${roomId}`);
}
