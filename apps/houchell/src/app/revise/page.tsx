"use client";
import { AppShell } from "@/components/AppShell";
import { InteractiveCatalog } from "@/components/InteractiveCatalog";

export default function RevisePage() {
  return (
    <AppShell>
      <InteractiveCatalog
        kicker="Revise"
        title="Revision tools"
        blurb="Bitesize, exam-ready revision for every KS3 and GCSE topic — hinge questions, hide-and-reveal quizzes and print-ready packs."
        filterTypes={["revision"]}
      />
    </AppShell>
  );
}
