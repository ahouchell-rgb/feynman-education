/* Local, no-login deck storage. Used when nobody is signed in so the slides
   editor is fully usable without an account. Each browser keeps its own decks. */
export const GUEST_KEY = "sk_guest_decks";

export const guestRead = () => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || []; } catch { return []; }
};

/* Thrown when a write can't fit in localStorage (big decks / pasted base64
   images). Carries a teacher-facing message and leaves existing storage intact. */
export class GuestQuotaError extends Error {
  constructor(message = "Your guest decks are full — sign in to save to the cloud, or remove large images.") {
    super(message);
    this.name = "GuestQuotaError";
  }
}

// localStorage signals an over-quota write a few different ways across browsers;
// recognise them all so we surface a clear message instead of corrupting storage.
export const isQuotaError = (e: any): boolean =>
  !!e && (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 || e.code === 1014
  );

/* Persist the decks. On a quota overflow we do NOT half-write or clear what's
   already stored — we throw a GuestQuotaError so the caller can warn the teacher
   while the latest edit is still safely held in memory. */
export const guestWrite = (decks) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(decks));
  } catch (e) {
    if (isQuotaError(e)) throw new GuestQuotaError();
    throw e;
  }
};

export const guestFind = (id) => guestRead().find((d) => d.id === id) || null;
