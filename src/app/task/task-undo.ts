/** Atsaukšanas loģika bez Angular, lai to var viegli testēt */

/** Cik ilgi redzama Undo josla un cik ilgi gaida ar dzēšanu */
export const UNDO_MS = 5000;

/** Darbība izpildās vēlāk, ja to neatceļ, un flush to izpilda uzreiz */
export class DelayedAction {
  private timer: ReturnType<typeof setTimeout> | null;

  constructor(private readonly run: () => void, ms: number = UNDO_MS) {
    this.timer = setTimeout(() => this.fire(), ms);
  }

  get pending(): boolean {
    return this.timer !== null;
  }

  /** true, ja paspēja atcelt pirms izpildes */
  cancel(): boolean {
    if (this.timer === null) return false;
    clearTimeout(this.timer);
    this.timer = null;
    return true;
  }

  flush(): void {
    if (this.timer !== null) this.fire();
  }

  private fire(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.run();
  }
}

/** Dzēšamie pazūd uzreiz, lai gan vēl var atsaukt */
export function withoutIds<T extends { id: number }>(items: T[], hidden: ReadonlySet<number>): T[] {
  return hidden.size ? items.filter((i) => !hidden.has(i.id)) : items;
}

/** Pļaušanai pogai savs teksts */
export function doneLabel(title: string): string {
  return /mow/i.test(title) ? 'Mowed' : 'Done';
}
