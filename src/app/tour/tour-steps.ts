// Visi apmācību teksti vienā vietā, lai tos viegli labot
export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** data tour atribūta vērtība, bez tās kartīte ir centrā */
  anchor?: string;
  /** Ja enkura nav, soli neizlaiž, bet rāda centrā */
  optionalAnchor?: boolean;
}

/** Katrai apmācībai sava atzīme, ka tā jau redzēta */
export type TourId = 'main' | 'bed';

/** Galvenā ekrāna apmācība, sākas pati vienu reizi */
export const MAIN_TOUR_STEPS: TourStep[] = [
  { id: 'welcome', anchor: 'garden-switcher', optionalAnchor: true, title: 'Welcome!',
    text: "Let's plan your garden in 5 quick steps: draw a bed, put plants in it, check what to do. Switch or add gardens here." },
  { id: 'map', anchor: 'map', title: 'Your plot',
    text: 'This is your plot. The outlined area is your garden boundary — beds and trees go inside it.' },
  { id: 'add', anchor: 'add-menu', title: 'Add beds, trees and items',
    text: 'Choose Add → Draw bed and click two opposite corners on the map. Select it later to drag corners into any shape; Esc cancels. Draw custom shape lets you click each corner, then click the first corner or press Finish. Trees and items like a greenhouse are here too.' },
  { id: 'plan', anchor: 'object-panel', optionalAnchor: true, title: 'Plan this bed',
    text: 'Click a bed to open its panel, then press "Plan this bed →" at the top to drag plants into it.' },
  { id: 'help', anchor: 'help-menu', title: "That's it",
    text: 'Try drawing your first bed now. All garden settings are in the garden menu → Garden settings…. My plants and this tour are in the ⋯ menu — restart it anytime.' },
];

/** Sākas, kad pirmo reizi atver dobes plānotāju */
export const BED_TOUR_STEPS: TourStep[] = [
  { id: 'palette', anchor: 'bed-palette', title: 'Pick a plant',
    text: 'Drag a plant from the list onto the bed — or click it to place it automatically.' },
  { id: 'block', anchor: 'bed-block', optionalAnchor: true, title: 'Stretch the block',
    text: 'Stretch the block with its handles. The plant count follows the spacing, e.g. "5 × 3 = 15 plants".' },
  { id: 'space', anchor: 'bed-space', title: 'How full is the bed?',
    text: 'This bar shows how much of the bed is used. "Tight" means nearly full, "Overcrowded" means too many plants.' },
];

export const TOURS: Record<TourId, TourStep[]> = { main: MAIN_TOUR_STEPS, bed: BED_TOUR_STEPS };

/** Vecais nosaukums, lai nesalūzt esošais kods */
export const TOUR_STEPS = MAIN_TOUR_STEPS;
