import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study 1",
  description: "Psychology experiment research system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
