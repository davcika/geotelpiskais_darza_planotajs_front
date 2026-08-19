import { Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { formatArea } from '../shared/format';

/** OL stila gabalus var lietot atkārtoti, tāpēc tos izveidojam vienreiz un dalām visiem slāņiem */
export const SELECTED_COLOR = '#2d6a3d';

/** Balta apmale, lai uzrakstus var izlasīt virs jebkuras kartes */
export const labelFill = new Fill({ color: '#1b261c' });
export const labelHalo = new Stroke({ color: '#ffffff', width: 3 });

export const selectedStroke = new Stroke({ color: SELECTED_COLOR, width: 3 });

/** Aplītis stūrī, aiz kura var vilkt */
export const vertexImage = new CircleStyle({
  radius: 5,
  fill: new Fill({ color: '#ffffff' }),
  stroke: new Stroke({ color: SELECTED_COLOR, width: 2 }),
});

/** Laukums ar vienu ciparu aiz komata */
export function areaLabel(m2: number): string {
  return formatArea(m2);
}
