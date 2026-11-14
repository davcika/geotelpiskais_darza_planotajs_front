/** Pēc noklusējuma saites un pogas, kas nav atslēgtas */
export function focusables(root: HTMLElement, selector = 'a[href], button:not([disabled])'): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/** Tab griežas pa apli konteinera iekšā, un ja fokuss ir ārā, tas lec uz pirmo vai pēdējo */
export function trapTab(e: KeyboardEvent, root: HTMLElement, items: HTMLElement[] = focusables(root)): void {
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !root.contains(active);
  if (e.shiftKey && (active === first || active === root || outside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
}
