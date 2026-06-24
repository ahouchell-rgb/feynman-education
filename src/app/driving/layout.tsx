import type { ReactNode } from "react";

export const metadata = {
  title: "UK Driving Test Trainer",
  description:
    "Practise the full UK driving theory test and hazard perception, with the correct answer and an explanation after every question, plus a revision library.",
};

export default function DrivingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
