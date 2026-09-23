import type { Metadata } from "next";
import { Montserrat, Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "EDIFIKA · Administra tus edificios, sin complicaciones",
  description: "Cuotas, cobranza y estado de cuenta de tu edificio, sin complicaciones.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${publicSans.variable} ${montserrat.variable} antialiased`}>{children}</body>
    </html>
  );
}
