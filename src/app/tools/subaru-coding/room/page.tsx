import type { Metadata } from "next";
import { SubaruAssistRoomClient } from "./SubaruAssistRoomClient";

export const metadata: Metadata = {
  title: "Комната Subaru — QHub",
  description: "Вход в комнату удалённого сервиса Subaru по коду мастера.",
};

export default function SubaruAssistRoomPage() {
  return <SubaruAssistRoomClient />;
}
