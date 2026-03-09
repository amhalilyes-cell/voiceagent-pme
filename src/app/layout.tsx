import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VoiceAgent PME — L'assistant vocal pour les artisans français",
  description:
    "Un agent vocal IA disponible 24h/24 pour répondre à vos clients, gérer vos rendez-vous et ne plus jamais rater une opportunité de chantier.",
  keywords: ["agent vocal", "IA artisan", "PME", "téléphonie IA", "assistant vocal"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
