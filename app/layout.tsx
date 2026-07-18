import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fashion Maze — One Look, Many Futures",
  description:
    "Choose a fashion narrative and walk into a live-generated world powered by Reactor.",
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
