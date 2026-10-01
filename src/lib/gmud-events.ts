// Simple event bus to open the "Nova GMUD" modal from anywhere (sidebar -> dashboard).
export const GMUD_OPEN_NEW_EVENT = "gmud:open-new";

export function emitOpenNewGmud() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GMUD_OPEN_NEW_EVENT));
}
