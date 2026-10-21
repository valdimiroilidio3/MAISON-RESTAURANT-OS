import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MAISON® — Restaurant OS",
    template: "%s · MAISON®",
  },
  description:
    "MAISON® Restaurant OS — website gastronómico, salão 3D interativo e sistema operacional de sala, cozinha, reservas e gestão.",
  applicationName: "MAISON® Restaurant OS",
  authors: [{ name: "MAISON®" }],
  keywords: ["restaurante", "gestão de restaurantes", "3D", "reservas", "Lisboa"],
  openGraph: {
    title: "MAISON® — Restaurant OS",
    description: "Cozinha de autor, fogo e tempo. Lisboa. Plataforma de gestão com salão 3D.",
    type: "website",
    locale: "pt_PT",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0908",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
