import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function LegacyMapRedirect({ params }: Props) {
  const { roomId } = await params;
  redirect(`/tools/family/parent/map/${roomId}`);
}
