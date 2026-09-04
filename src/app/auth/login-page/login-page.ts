import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { problemDetail } from '../../shared/format';
import { safeReturnUrl } from '../auth.guard';
import { AuthService } from '../auth.service';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Dev login poga redzama tikai izstrādes režīmā */
  protected readonly isDev = isDevMode();
  protected readonly mode = signal<Mode>('login');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const email = String(form.get('email'));
    const password = String(form.get('password'));

    if (this.mode() === 'register' && password !== form.get('passwordRepeat')) {
      this.error.set('Passwords do not match');
      return;
    }
    this.run(
      this.mode() === 'login' ? this.auth.login(email, password) : this.auth.register(email, password),
    );
  }

  protected devLogin(): void {
    this.run(this.auth.devLogin());
  }

  protected toggleMode(): void {
    this.mode.update((mode) => (mode === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  private run(request: Observable<void>): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'))),
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        // Status 0 nozīmē, ka serveris vispār neatbild
        this.error.set(
          error.status === 0
            ? 'Could not reach the server'
            : problemDetail(error, `Error ${error.status}`),
        );
      },
    });
  }
}
