import { extractScannableUrl } from "@/lib/code-scanner/url-utils";

interface Props {
  raw: string;
}

export default function ScannedRawContent({ raw }: Props) {
  const url = extractScannableUrl(raw);

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 underline break-all block bg-gray-50 rounded-lg p-3"
      >
        {raw.trim()}
      </a>
    );
  }

  return (
    <pre className="text-xs whitespace-pre-wrap break-all bg-gray-50 rounded-lg p-3 max-h-40 overflow-auto">
      {raw}
    </pre>
  );
}
