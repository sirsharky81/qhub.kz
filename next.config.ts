import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const sharedConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audio-extractor/*": ["./bin/yt-dlp", "./bin/yt-dlp.exe"],
  },
  outputFileTracingExcludes: {
    "/api/audio-extractor/*": [
      "./debug-*.log",
      "./docs/**",
      "./.cursor/**",
      "./public/models/**",
    ],
  },
  async redirects() {
    if (isCapacitorBuild) return [];
    return [
      {
        source: "/random-picker",
        destination: "/tools/random-picker",
        permanent: true,
      },
      {
        source: "/qr-generator",
        destination: "/tools/qr-generator",
        permanent: true,
      },
      // Legacy dynamic family/messenger URLs → query-param routes (static export)
      {
        source: "/tools/family/parent/room/:roomId",
        destination: "/tools/family/parent/room?id=:roomId",
        permanent: false,
      },
      {
        source: "/tools/family/parent/map/:roomId",
        destination: "/tools/family/parent/map?id=:roomId",
        permanent: false,
      },
      {
        source: "/tools/messenger/chat/:peerId",
        destination: "/tools/messenger/chat?peer=:peerId",
        permanent: false,
      },
      {
        // Keep legacy room links working, but do not hijack real subroutes:
        // /tools/messenger/room/create and /tools/messenger/room/join.
        source: "/tools/messenger/room/:roomId((?!create$|join$).+)",
        destination: "/tools/messenger/room?id=:roomId",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

const capacitorOverrides: NextConfig = isCapacitorBuild
  ? {
      output: "export",
      distDir: "out",
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {};

const nextConfig: NextConfig = {
  ...sharedConfig,
  ...capacitorOverrides,
};

export default nextConfig;
