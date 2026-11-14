import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { readStored, removeStoredWithPrefix, writeStored } from '../shared/storage';
import { tipKey } from './tour-logic';

/** Aizvērtos padomus atceras localStorage katram lietotājam atsevišķi */
@Injectable({ providedIn: 'root' })
export class TipService {
  private readonly auth = inject(AuthService);
  /** Lai padoms pazūd uzreiz arī tad, ja localStorage nestrādā */
  private readonly dismissedNow = signal<ReadonlySet<string>>(new Set());

  isDismissed(id: string): boolean {
    if (this.dismissedNow().has(id)) return true;
    return readStored(tipKey(id, this.auth.email())) === '1';
  }

  dismiss(id: string): void {
    this.dismissedNow.update((s) => new Set(s).add(id));
    writeStored(tipKey(id, this.auth.email()), '1');
  }

  /** Atkal rāda visus padomus */
  resetAll(): void {
    this.dismissedNow.set(new Set());
    removeStoredWithPrefix('tip.');
  }
}
