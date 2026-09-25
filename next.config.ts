import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-pdf se ejecuta en Node tal cual (genera los PDF de recibos y estados de cuenta)
  serverExternalPackages: ["@react-pdf/renderer"],
  // Las fuentes estándar del PDF se cargan de forma dinámica y Vercel no las detecta solo:
  // se incluyen en las funciones que dibujan PDF (rutas /pdf y la acción de enviar recibos)
  outputFileTracingIncludes: {
    "/pdf/**": ["./node_modules/pdfkit/js/standard-fonts/**"],
    "/recibos": ["./node_modules/pdfkit/js/standard-fonts/**"],
  },
};

export default nextConfig;
