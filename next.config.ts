import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-pdf se ejecuta en Node tal cual (genera los PDF de recibos y estados de cuenta)
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
