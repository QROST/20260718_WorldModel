// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import type { Metadata } from "next";
import {
  QROST_PROVENANCE,
  QROST_PROVENANCE_VALUE,
} from "@/lib/qrost-provenance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fashion Maze — One Look, Many Futures",
  description:
    "Choose a fashion narrative and walk into a live-generated world powered by Reactor.",
  authors: [
    {
      name: QROST_PROVENANCE.creator,
      url: QROST_PROVENANCE.creatorUrl,
    },
  ],
  creator: QROST_PROVENANCE.creator,
  publisher: QROST_PROVENANCE.creator,
  other: {
    "qrost:provenance": QROST_PROVENANCE_VALUE,
    "qrost:work-id": QROST_PROVENANCE.workId,
    "qrost:canonical": QROST_PROVENANCE.canonicalRepository,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
