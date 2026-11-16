import type { NextConfig } from "next";
const config: NextConfig = {
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "/*": ["./.venv/**/*", "./.runtime/**/*", "./test-output/**/*"],
  },
  poweredByHeader: false,
  experimental: { proxyClientMaxBodySize: "100mb" },
};
export default config;
