/* Local, no-login deck storage. Used when nobody is signed in so the slides
   editor is fully usable without an account. Each browser keeps its own decks. */
export const GUEST_KEY = "sk_guest_decks";

export const guestRead = () => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || []; } catch { return []; }
};

export const guestWrite = (decks) => {
  if (typeof window !== "undefined") localStorage.setItem(GUEST_KEY, JSON.stringify(decks));
};

export const guestFind = (id) => guestRead().find((d) => d.id === id) || null;
