import { Draw } from 'ol/interaction';

/** Visur zīmē vienādi, lai lietotājam nav jāmācās katram rīkam savs veids */
export const BOX_DRAW_HINT = 'Click one corner, then the opposite corner (or Shift+drag). Select the bed afterwards to drag its corners.';
export const POLYGON_DRAW_HINT = 'Click to add corners. Click the first corner, double-click or press Finish (Enter) to close.';
export const LINE_DRAW_HINT = 'Click to add points. Double-click or press Finish (Enter) to end the line.';

/** Kamēr lietotājs raksta laukā, kartes taustiņiem jāklusē */
export function isTyping(event: KeyboardEvent): boolean {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  );
}

/** Ja punktu par maz, OL pats neko nedara */
export function finishDrawing(draws: Draw[]): void {
  draws.filter((draw) => draw.getActive()).forEach((draw) => draw.finishDrawing());
}

export function undoPoint(draws: Draw[]): void {
  draws.filter((draw) => draw.getActive()).forEach((draw) => draw.removeLastPoint());
}

/** Atgriež true tikai tad, ja zīmēšanu atcēla ar Esc */
export function handleDrawKeys(event: KeyboardEvent, draws: Draw[]): boolean {
  if (event.key === 'Escape') {
    draws.forEach((draw) => draw.abortDrawing());
    return true;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    undoPoint(draws);
  } else if (event.key === 'Enter') {
    // Ja fokusā ir poga, lai Enter nospiež to
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return false;
    event.preventDefault();
    finishDrawing(draws);
  }
  return false;
}
