import { describe, it, expect } from "vitest";
import { can, type Entitlement } from "./entitlements.js";

const ent = (features: Record<string, any>): Entitlement => ({ plan: "pro", status: "active", active: true, features });

describe("can", () => {
  it("is true only for truthy features", () => {
    const e = ent({ ai_revision: true, ai_cover: 1, disabled: false, missing: undefined });
    expect(can(e, "ai_revision")).toBe(true);
    expect(can(e, "ai_cover")).toBe(true);
    expect(can(e, "disabled")).toBe(false);
    expect(can(e, "missing")).toBe(false);
    expect(can(e, "not_present")).toBe(false);
  });
  it("is safe when features is empty", () => {
    expect(can(ent({}), "anything")).toBe(false);
  });
});

describe("trial / lifecycle entitlements", () => {
  // A trialing subscription on a trial (or Pro) plan grants the AI generators —
  // getEntitlement() treats status "trialing" the same as "active".
  it("grants ai_generators on a trial plan", () => {
    const trial: Entitlement = { plan: "trial", status: "trialing", active: true, features: { ai_generators: true, unlimited_ai: true } };
    expect(can(trial, "ai_generators")).toBe(true);
    expect(can(trial, "unlimited_ai")).toBe(true);
  });
  it("does NOT grant ai_generators when canceled/expired (falls back to free)", () => {
    // getEntitlement() returns FREE for a canceled/inactive subscription, i.e.
    // an empty feature set — so nothing is granted.
    const expired: Entitlement = { plan: "free", status: "inactive", active: false, features: {} };
    expect(can(expired, "ai_generators")).toBe(false);
    const canceled: Entitlement = { plan: "free", status: "canceled", active: false, features: {} };
    expect(can(canceled, "ai_generators")).toBe(false);
  });
});
