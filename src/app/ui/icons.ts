import Icon from 'ol/style/Icon';
import { ICON_MANIFEST } from './icon-manifest';

/** Augus meklē pēc angliskā nosaukuma */
export function plantIconUrl(nameEn: string | null | undefined): string | null {
  return (nameEn && ICON_MANIFEST.plants[nameEn]) || null;
}

export function itemIconUrl(key: string | null | undefined): string | null {
  return (key && ICON_MANIFEST.items[key]) || null;
}

/** Kad kāds attēls ielādējas, paziņojam klausītājiem, lai kartes slāņi pārzīmējas */
const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

export function onIconLoad(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Ielādi sāk tikai vienreiz, un true nozīmē, ka attēls jau gatavs */
export function preloadIcon(url: string): boolean {
  let img = images.get(url);
  if (!img) {
    if (typeof Image === 'undefined') return false;
    img = new Image();
    img.decoding = 'async';
    img.onload = () => listeners.forEach((cb) => cb());
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth > 0;
}

export function preloadAllIcons(): void {
  [...Object.values(ICON_MANIFEST.items), ...Object.values(ICON_MANIFEST.plants)].forEach(preloadIcon);
}

const olIcons = new Map<string, Icon>();
/** Kamēr attēls nav ielādēts, atdod null, un tad kartē rāda emocijzīmi */
export function olIcon(url: string, sizePx: number): Icon | null {
  if (!preloadIcon(url)) return null;
  const size = Math.max(4, Math.round(sizePx));
  const id = `${url}@${size}`;
  let icon = olIcons.get(id);
  if (!icon) {
    icon = new Icon({ img: images.get(url)!, width: size, height: size });
    olIcons.set(id, icon);
  }
  return icon;
}
