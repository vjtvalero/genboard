import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Genboard",
  description: "No-code app development — PM + Senior Engineer collaboration.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="en">
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
