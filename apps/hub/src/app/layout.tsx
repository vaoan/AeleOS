import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeleOS",
  description: "Your identity across Furry Colombia.",
};

/**
 * The root layout, wrapping every page in Clerk's provider.
 *
 * `ClerkProvider` sits outside `<html>` deliberately: it must enclose the whole
 * tree so that server components can read the session during render.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
