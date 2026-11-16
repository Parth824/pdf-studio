import type { Metadata } from "next";
import "./globals.css";
import "./converter.css";
export const metadata: Metadata = {
  title: "PDF Studio — All your PDF tools, in one place",
  description:
    "Merge, split, compress, convert, edit and protect your PDFs in one simple workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
