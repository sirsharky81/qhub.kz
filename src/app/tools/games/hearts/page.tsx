import type { Metadata } from "next";
import HeartsClient from "./HeartsClient";

export const metadata: Metadata = {
  title: "Червы (Hearts) — QHub Games",
  description:
    "Классическая карточная игра Червы для 4 игроков: офлайн против ботов и онлайн-сессии.",
};

export default async function HeartsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "create-online" || params.mode === "join-online" || params.mode === "offline"
      ? params.mode
      : "offline";
  return <HeartsClient initialMode={mode} />;
}
