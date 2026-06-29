"use client";

/* Client-side Premium flag. This is the commercial surface / trial UX only —
 * real enforcement (server-checked entitlement) requires an account + Stripe,
 * which is the next step. Stored on-device so the trial unlocks features here. */

const KEY = "uk-driving-premium-v1";

interface PremiumState {
  active: boolean;
  /** epoch ms when a free trial ends, if on trial */
  trialEndsAt?: number;
}

function read(): PremiumState {
  if (typeof window === "undefined") return { active: false };
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "") || { active: false };
  } catch {
    return { active: false };
  }
}
function write(s: PremiumState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function isPremium(): boolean {
  const s = read();
  if (s.active) return true;
  if (s.trialEndsAt && Date.now() < s.trialEndsAt) return true;
  return false;
}

/** Start a 3-day free trial (demo: unlocks Premium on this device). */
export function startTrial(): void {
  write({ active: false, trialEndsAt: Date.now() + 3 * 86400000 });
}

export function setPremium(active: boolean): void {
  write({ active });
}
