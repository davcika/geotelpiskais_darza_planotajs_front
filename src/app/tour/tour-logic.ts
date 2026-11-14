// Bez DOM, lai var viegli testēt
import { pathOf } from '../shared/format';
import { TourStep } from './tour-steps';

export interface Rect { top: number; left: number; width: number; height: number; }
export interface Size { width: number; height: number; }
export type Placement = 'below' | 'above' | 'right' | 'left' | 'center' | 'dock';
export interface CardPosition { placement: Placement; top: number; left: number; }

/** Soli rāda, ja tam nav enkura, enkurs ir redzams vai tas nav obligāts */
export function isStepShowable(step: TourStep, anchorVisible: (anchor: string) => boolean): boolean {
  if (!step.anchor) return true;
  return anchorVisible(step.anchor) || !!step.optionalAnchor;
}

/** Atrod nākamo rādāmo soli dotajā virzienā vai atdod mīnus vienu */
export function findStep(steps: TourStep[], from: number, dir: 1 | -1,
                         anchorVisible: (anchor: string) => boolean): number {
  for (let i = from + dir; i >= 0 && i < steps.length; i += dir) {
    if (isStepShowable(steps[i], anchorVisible)) return i;
  }
  return -1;
}

/** Skaitītājam skaita tikai tos soļus, kurus tiešām rādīs */
export function stepCounter(steps: TourStep[], index: number,
                            anchorVisible: (anchor: string) => boolean): { current: number; total: number } {
  let current = 0, total = 0;
  steps.forEach((s, i) => {
    if (isStepShowable(s, anchorVisible)) { total++; if (i <= index) current++; }
  });
  return { current, total };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/** Kartīti liek zem, virs vai blakus elementam, ja nekur neder, tad centrā, bet telefonā vienmēr apakšā */
export function computePlacement(target: Rect | null, card: Size, viewport: Size,
                                 gap = 12, margin = 8, mobileBreakpoint = 600): CardPosition {
  if (viewport.width < mobileBreakpoint) {
    return { placement: 'dock', top: viewport.height - card.height - margin, left: margin };
  }
  const center: CardPosition = {
    placement: 'center',
    top: Math.max(margin, (viewport.height - card.height) / 2),
    left: Math.max(margin, (viewport.width - card.width) / 2),
  };
  if (!target) return center;
  const maxLeft = viewport.width - card.width - margin;
  const maxTop = viewport.height - card.height - margin;
  const hLeft = clamp(target.left + target.width / 2 - card.width / 2, margin, maxLeft);
  const vTop = clamp(target.top + target.height / 2 - card.height / 2, margin, maxTop);
  const bottom = target.top + target.height;
  const right = target.left + target.width;

  if (bottom + gap + card.height + margin <= viewport.height) return { placement: 'below', top: bottom + gap, left: hLeft };
  if (target.top - gap - card.height >= margin) return { placement: 'above', top: target.top - gap - card.height, left: hLeft };
  if (right + gap + card.width + margin <= viewport.width) return { placement: 'right', top: vTop, left: right + gap };
  if (target.left - gap - card.width >= margin) return { placement: 'left', top: vTop, left: target.left - gap - card.width };
  // Lielam elementam kā karte kartīti liekam pa vidu virsū
  return center;
}


/** Kura apmācība šajā lapā sākas pati, ja kāda */
export function autoTourFor(path: string): 'main' | 'bed' | null {
  const clean = pathOf(path);
  if (clean === '/') return 'main';
  if (/^\/beds\/\d+\/?$/.test(clean)) return 'bed';
  return null;
}

/** Galvenajai apmācībai paliek vecā atslēga, lai lietotāji to neredz vēlreiz */
export function tourDoneKey(tour: 'main' | 'bed', user: string | null): string {
  const who = user ?? 'anonymous';
  return tour === 'main' ? `tour.done.${who}` : `tour.${tour}.done.${who}`;
}

export function tipKey(id: string, user: string | null): string {
  return `tip.${id}.${user ?? 'anonymous'}`;
}
