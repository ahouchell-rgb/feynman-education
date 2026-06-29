"use client";
import { AppShell } from "@/components/AppShell";
import { InteractiveCatalog } from "@/components/InteractiveCatalog";

export default function ToolsPage() {
  return (
    <AppShell>
      <InteractiveCatalog
        kicker="Tools"
        title="Interactive tools"
        blurb="Simulations, model builders and explorers for the classroom and projector — zoom into a cell, balance an equation, build a circuit."
        filterTypes={["interactive tool"]}
      />
    </AppShell>
  );
}
