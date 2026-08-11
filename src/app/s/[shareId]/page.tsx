import type { Metadata } from "next";
import { SendDownloadClient } from "./SendDownloadClient";

export const metadata: Metadata = {
  title: "Скачать — QHub Send",
  description: "Скачивание файла по ссылке QHub Send",
};

export default function SendDownloadPage() {
  return <SendDownloadClient />;
}
