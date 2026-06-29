import type { ReactNode } from "react";

export const metadata = {
  title: "UK Driving Test Trainer",
  description:
    "Practise the full UK driving theory test and hazard perception, with lessons, the correct answer and an explanation after every question, plus a revision library.",
  manifest: "/driving.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Driving Test",
    statusBarStyle: "default" as const,
  },
  icons: {
    icon: "/driving-icon.svg",
    apple: "/driving-icon.svg",
  },
};

export const viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
};

export default function DrivingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
