import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Building Buddy · Administración de edificios",
  description: "Cuotas, cobranza y estado de cuenta de tu edificio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${publicSans.variable} ${bricolage.variable} antialiased`}>{children}</body>
    </html>
  );
}
