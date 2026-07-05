import type { Metadata } from "next";
import HeartsClient from "./HeartsClient";

export const metadata: Metadata = {
  title: "Червы (Hearts) — QHub Games",
  description:
    "Классическая карточная игра Червы для 4 игроков: офлайн против ботов и онлайн-сессии.",
};

export default function HeartsPage() {
  return <HeartsClient />;
}
