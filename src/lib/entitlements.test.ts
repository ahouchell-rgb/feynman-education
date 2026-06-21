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
