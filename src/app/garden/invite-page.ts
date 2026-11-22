import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GardenStore, InvitePreviewDto } from './garden-store';
import { problemDetail } from '../shared/format';

/** Uzaicinājuma lapa, kur var pievienoties cita lietotāja dārzam */
@Component({
  selector: 'app-invite-page',
  imports: [RouterLink],
  styles: `
    :host { display: grid; place-items: center; box-sizing: border-box; min-height: 100dvh; padding: 16px; }
    main { width: min(440px, 100%); padding: 24px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); }
    h1 { margin-top: 0; font-size: 1.3rem; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .muted { color: var(--color-muted); }
    .error { color: var(--color-error); }
  `,
  template: `
    <main>
      @if (state() === 'loading') {
        <p class="muted" role="status">Loading invitation…</p>
      } @else if (state() === 'invalid') {
        <h1>This invite link doesn’t work</h1>
        <p>It may have expired or been turned off by the garden owner. Ask them for a new link.</p>
        <div class="actions"><a class="btn" routerLink="/">Go to my gardens</a></div>
      } @else if (preview(); as p) {
        <h1>{{ p.ownerEmail }} invited you to edit “{{ p.gardenName }}”</h1>
        @if (p.alreadyMember) {
          <p class="muted">You already have access to this garden.</p>
        } @else {
          <p class="muted">You’ll be able to change beds, plantings and tasks in this garden.</p>
        }
        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <div class="actions">
          <a class="btn" routerLink="/">Not now</a>
          <button type="button" class="btn primary" [disabled]="busy()" (click)="join()">{{ p.alreadyMember ? 'Open garden' : 'Join' }}</button>
        </div>
      }
    </main>
  `,
})
export class InvitePage implements OnInit {
  private readonly store = inject(GardenStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly state = signal<'loading' | 'ready' | 'invalid'>('loading');
  protected readonly preview = signal<InvitePreviewDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private tokenValue(): string {
    return this.route.snapshot.paramMap.get('token') ?? '';
  }

  ngOnInit(): void {
    const token = this.tokenValue();
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.store.previewInvite(token).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.state.set('ready');
      },
      error: () => this.state.set('invalid'),
    });
  }

  protected join(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.store.acceptInvite(this.tokenValue()).subscribe({
      // Ja dārzam vēl nav zonas, hubGuard aizvedīs uz onboarding
      next: () => this.router.navigateByUrl('/'),
      error: (err) => {
        this.busy.set(false);
        if (err?.status === 404) this.state.set('invalid');
        else this.error.set(problemDetail(err, 'Could not join the garden. Try again.'));
      },
    });
  }
}
