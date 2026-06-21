import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhook, stripeConfigured } from "./stripe.js";

const SECRET = "whsec_test_secret_value";

function signedHeader(body: string, secret = SECRET, t = "1700000000"): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyWebhook", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = SECRET; });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    expect(verifyWebhook(body, signedHeader(body))).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const header = signedHeader(body);
    expect(verifyWebhook(body + "x", header)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const body = JSON.stringify({ id: "evt_1" });
    expect(verifyWebhook(body, signedHeader(body, "whsec_wrong"))).toBe(false);
  });

  it("accepts a payload when ONE of several v1 signatures matches (secret rotation)", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const good = createHmac("sha256", SECRET).update(`1700000000.${body}`).digest("hex");
    const bad = createHmac("sha256", "whsec_old_secret").update(`1700000000.${body}`).digest("hex");
    // Stripe sends both signatures during a webhook-secret rotation.
    expect(verifyWebhook(body, `t=1700000000,v1=${bad},v1=${good}`)).toBe(true);
    expect(verifyWebhook(body, `t=1700000000,v1=${good},v1=${bad}`)).toBe(true);
  });

  it("rejects a missing or malformed header", () => {
    const body = "{}";
    expect(verifyWebhook(body, null)).toBe(false);
    expect(verifyWebhook(body, "garbage")).toBe(false);
    expect(verifyWebhook(body, "t=1700000000")).toBe(false); // no v1
  });

  it("rejects everything when no webhook secret is configured", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const body = "{}";
    expect(verifyWebhook(body, signedHeader(body))).toBe(false);
  });
});

describe("stripeConfigured", () => {
  it("reflects the presence of STRIPE_SECRET_KEY", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(stripeConfigured()).toBe(true);
    delete process.env.STRIPE_SECRET_KEY;
  });
});
