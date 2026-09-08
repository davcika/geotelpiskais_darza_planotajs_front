import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { GardenFormDialog } from '../../garden/garden-form-dialog';

/** Rāda, kad lietotājam vēl nav neviena dārza */
@Component({
  selector: 'app-welcome-page',
  imports: [GardenFormDialog],
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 16px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 1.8rem; }
    p { margin: 0 0 24px; color: var(--color-muted); }
    .big { padding: 18px 32px; font-size: 1.15rem; }
    .logout { margin-top: 24px; border: none; background: none; color: var(--color-muted); text-decoration: underline; cursor: pointer; }
  `,
  template: `
    <main>
      <h1>Welcome to your garden planner</h1>
      <p>Start by creating your garden. You can add more gardens later.</p>
      <button type="button" class="btn primary big" (click)="open.set(true)">Create your first garden</button>
      <div><button type="button" class="logout" (click)="auth.logout()">Log out</button></div>
    </main>
    @if (open()) {
      <app-garden-form-dialog (saved)="created()" (closed)="open.set(false)" />
    }
  `,
})
export class WelcomePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);

  protected created(): void {
    this.router.navigate(['/onboarding']);
  }
}
