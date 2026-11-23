/** Privātajā režīmā glabātuve var nestrādāt, tad lasot dabū null un rakstot nekas nenotiek */
export type StorageKind = 'local' | 'session';

function storage(kind: StorageKind): Storage {
  return kind === 'session' ? sessionStorage : localStorage;
}

export function readStored(key: string, kind: StorageKind = 'local'): string | null {
  try {
    return storage(kind).getItem(key);
  } catch {
    return null;
  }
}

/** Ja vērtība ir null, atslēgu izdzēš */
export function writeStored(key: string, value: string | null, kind: StorageKind = 'local'): void {
  try {
    if (value === null) storage(kind).removeItem(key);
    else storage(kind).setItem(key, value);
  } catch {
    // glabātuve nestrādā, neko nedarām
  }
}

export function removeStoredWithPrefix(prefix: string, kind: StorageKind = 'local'): void {
  try {
    const s = storage(kind);
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(prefix)) s.removeItem(k);
    }
  } catch {
    // glabātuve nestrādā, neko nedarām
  }
}
