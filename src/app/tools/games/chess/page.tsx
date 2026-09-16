import type { Metadata } from "next";
import ChessClient from "./ChessClient";

export const metadata: Metadata = {
  title: "Шахматы — QHub Games",
  description: "Классические шахматы: игра против ИИ (10 уровней), онлайн-комнаты и шахматные часы.",
};

export default async function ChessPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "create-online" || params.mode === "join-online" || params.mode === "offline"
      ? params.mode
      : "offline";
  return <ChessClient initialMode={mode} />;
}
