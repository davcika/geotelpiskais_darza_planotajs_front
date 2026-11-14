import { BED_TOUR_STEPS, MAIN_TOUR_STEPS, TourStep } from './tour-steps';
import { autoTourFor, computePlacement, findStep, stepCounter, tipKey, tourDoneKey } from './tour-logic';

const steps: TourStep[] = [
  { id: 'a', title: '', text: '' },
  { id: 'b', title: '', text: '', anchor: 'missing' },
  { id: 'c', title: '', text: '', anchor: 'opt', optionalAnchor: true },
  { id: 'd', title: '', text: '', anchor: 'here' },
];
const visible = (a: string) => a === 'here';

describe('tour logic', () => {
  it('izlaiž soļus bez enkura, bet rāda optionalAnchor', () => {
    expect(findStep(steps, 0, 1, visible)).toBe(2);
    expect(findStep(steps, 2, 1, visible)).toBe(3);
    expect(findStep(steps, 3, 1, visible)).toBe(-1);
    expect(findStep(steps, 3, -1, visible)).toBe(2);
    expect(findStep(steps, -1, 1, visible)).toBe(0);
  });

  it('skaitītājs ignorē izlaistos soļus', () => {
    expect(stepCounter(steps, 3, visible)).toEqual({ current: 3, total: 3 });
  });

  const vp = { width: 1200, height: 800 };
  const card = { width: 300, height: 150 };

  it('novieto zem enkura', () => {
    const p = computePlacement({ top: 10, left: 100, width: 100, height: 40 }, card, vp);
    expect(p.placement).toBe('below');
    expect(p.top).toBe(62);
  });

  it('novieto virs, ja apakšā nav vietas', () => {
    expect(computePlacement({ top: 700, left: 100, width: 100, height: 60 }, card, vp).placement).toBe('above');
  });

  it('novieto pa labi garam elementam', () => {
    expect(computePlacement({ top: 0, left: 0, width: 200, height: 800 }, card, vp).placement).toBe('right');
  });

  it('centrē, ja enkurs aizņem visu ekrānu vai nav enkura', () => {
    expect(computePlacement({ top: 0, left: 0, width: 1200, height: 800 }, card, vp).placement).toBe('center');
    expect(computePlacement(null, card, vp).placement).toBe('center');
  });

  it('nepārsniedz skata loga malas', () => {
    const p = computePlacement({ top: 10, left: 1150, width: 40, height: 20 }, card, vp);
    expect(p.left + card.width).toBeLessThanOrEqual(vp.width - 8);
  });

  it('telefonā piestiprina apakšā', () => {
    expect(computePlacement({ top: 0, left: 0, width: 50, height: 50 }, card, { width: 360, height: 640 }).placement).toBe('dock');
  });

  it('galvenā apmācība ir 5 soļi, dobes — 3', () => {
    expect(MAIN_TOUR_STEPS.length).toBe(5);
    expect(BED_TOUR_STEPS.length).toBe(3);
    expect(MAIN_TOUR_STEPS[MAIN_TOUR_STEPS.length - 1].anchor).toBe('help-menu');
    expect(BED_TOUR_STEPS.map((s) => s.anchor)).toEqual(['bed-palette', 'bed-block', 'bed-space']);
  });

  it('teksti neatsaucas uz veco modeli', () => {
    const all = [...MAIN_TOUR_STEPS, ...BED_TOUR_STEPS].map((s) => s.title + ' ' + s.text).join(' ').toLowerCase();
    expect(all).not.toContain('paint grid');
    expect(all).not.toContain('double-click');
    expect(all).not.toContain('1-minute');
    expect(all).toContain('first corner or press finish');
    expect(BED_TOUR_STEPS[1].text).toContain('5 × 3 = 15');
  });

  it('izvēlas automātisko apmācību pēc ceļa', () => {
    expect(autoTourFor('/')).toBe('main');
    expect(autoTourFor('/?x=1')).toBe('main');
    expect(autoTourFor('/beds/12')).toBe('bed');
    expect(autoTourFor('/beds/abc')).toBeNull();
    expect(autoTourFor('/today')).toBeNull();
  });

  it('atslēgas: galvenā saglabā veco, dobes un padomi atsevišķas', () => {
    expect(tourDoneKey('main', 'a@b.lv')).toBe('tour.done.a@b.lv');
    expect(tourDoneKey('bed', 'a@b.lv')).toBe('tour.bed.done.a@b.lv');
    expect(tourDoneKey('bed', null)).toBe('tour.bed.done.anonymous');
    expect(tipKey('soil', 'a@b.lv')).toBe('tip.soil.a@b.lv');
  });
});
