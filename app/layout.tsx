import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";
import "./member-experience.css";

export const metadata: Metadata = {
  title: "Collab — Your Community. A Wider Business Network.",
  description:
    "Independent chambers and business organizations, connected through a shared network. Your community, your identity, and a wider world of connections.",
  icons: {
    icon: "/collab-logo.png",
    apple: "/collab-logo.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#001167"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fjalla+One&family=Work+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
