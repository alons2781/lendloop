import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LendLoop – Borrow tools from your neighbors",
  description:
    "A neighborhood tool-lending app. Borrow what you need, lend what you have.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Clerk reads request data, so it must sit inside Suspense (Cache Components) */}
        <Suspense>
          <ClerkProvider
            appearance={{
              // Username + password only: hide social buttons ("Continue with
              // Google") and the "or" divider in the sign-in/sign-up widget.
              elements: {
                socialButtonsRoot: { display: "none" },
                dividerRow: { display: "none" },
              },
            }}
          >
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ClerkProvider>
        </Suspense>
      </body>
    </html>
  );
}
