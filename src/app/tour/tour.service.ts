import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { TourId, TOURS, TourStep } from './tour-steps';
import { autoTourFor, findStep, stepCounter, tourDoneKey } from './tour-logic';
import { pathOf } from '../shared/format';
import { readStored, writeStored } from '../shared/storage';

/** Atrod enkuru, bet tikai tādu, kas tiešām redzams ekrānā */
export function findAnchor(anchor: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement | SVGElement>(`[data-tour="${anchor}"]`);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el as HTMLElement;
  }
  return null;
}

const anchorVisible = (a: string) => !!findAnchor(a);

@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly tourId = signal<TourId>('main');
  private readonly stepsSig = computed<TourStep[]>(() => TOURS[this.tourId()]);
  get steps(): TourStep[] { return this.stepsSig(); }

  readonly active = signal(false);
  readonly index = signal(0);
  readonly counter = signal({ current: 1, total: 1 });
  private waitTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => this.maybeAutoStart((e as NavigationEnd).urlAfterRedirects));
    inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); this.stopWaiting(); });
  }

  /** Sāk apmācību no paša sākuma, pēc noklusējuma galveno */
  start(tour: TourId = 'main'): void {
    this.stopWaiting();
    this.tourId.set(tour);
    const first = findStep(this.steps, -1, 1, anchorVisible);
    if (first < 0) return;
    this.goTo(first);
    this.active.set(true);
  }

  next(): void {
    const i = findStep(this.steps, this.index(), 1, anchorVisible);
    if (i < 0) this.finish(); else this.goTo(i);
  }

  back(): void {
    const i = findStep(this.steps, this.index(), -1, anchorVisible);
    if (i >= 0) this.goTo(i);
  }

  isLast(): boolean {
    return findStep(this.steps, this.index(), 1, anchorVisible) < 0;
  }

  isFirst(): boolean {
    return findStep(this.steps, this.index(), -1, anchorVisible) < 0;
  }

  /** Izlaista apmācība skaitās tāpat kā pabeigta */
  skip(): void { this.finish(); }

  finish(): void {
    this.active.set(false);
    this.markDone();
  }

  /** Noder testos, lai apmācību varētu redzēt atkal */
  reset(tour: TourId = this.tourId()): void {
    writeStored(this.storageKey(tour), null);
  }

  isDone(tour: TourId = this.tourId()): boolean {
    return readStored(this.storageKey(tour)) === '1';
  }

  private markDone(): void {
    writeStored(this.storageKey(this.tourId()), '1');
  }

  private storageKey(tour: TourId): string {
    return tourDoneKey(tour, this.auth.email());
  }

  private goTo(i: number): void {
    this.index.set(i);
    this.counter.set(stepCounter(this.steps, i, anchorVisible));
  }

  /** Palaiž apmācību pati vienu reizi, kad lapā parādās vajadzīgais elements */
  private maybeAutoStart(url: string): void {
    this.stopWaiting();
    const tour = autoTourFor(url);
    if (!tour || this.active() || this.isDone(tour)) return;
    const anchor = tour === 'main' ? 'map' : 'bed-palette';
    const samePage = () => pathOf(this.router.url) === pathOf(url);
    let tries = 0;
    this.waitTimer = setInterval(() => {
      tries++;
      if (!samePage() || tries > 60) { this.stopWaiting(); return; }
      if (findAnchor(anchor)) {
        this.stopWaiting();
        // Mazliet pagaidām, lai pārējais ekrāns paspēj uzzīmēties
        setTimeout(() => { if (!this.isDone(tour) && !this.active() && samePage()) this.start(tour); }, 600);
      }
    }, 250);
  }

  private stopWaiting(): void {
    if (this.waitTimer) { clearInterval(this.waitTimer); this.waitTimer = null; }
  }
}
