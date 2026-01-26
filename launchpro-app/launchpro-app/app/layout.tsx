import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AuthProvider from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LaunchPro - Launch Campaigns with AI",
  description: "Create and launch digital advertising campaigns across Tonic, Meta, and TikTok with AI-powered content generation.",
};

// Maintenance mode banner - set to true to show maintenance message
const MAINTENANCE_MODE = true;

function MaintenanceBanner() {
  if (!MAINTENANCE_MODE) return null;

  return (
    <div className="bg-amber-500 text-black px-4 py-3 text-center font-medium">
      <span className="inline-flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <strong>Mantenimiento Intensivo:</strong> Estamos realizando mejoras en el sistema. Algunas campañas pueden experimentar retrasos temporales. Gracias por su paciencia.
      </span>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <MaintenanceBanner />
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
