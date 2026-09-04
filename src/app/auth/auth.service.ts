import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { readStored, writeStored } from '../shared/storage';

/** Tas pats, ko atdod Java AuthResponse */
interface Session {
  token: string;
  email: string;
}

export const AUTH_API = '/api/auth/';
const STORAGE_KEY = 'darza-planotajs.session';

/** Tokenu glabājam localStorage, lai pēc lapas pārlādes nav jāpiesakās vēlreiz */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly token = computed(() => this.session()?.token ?? null);
  readonly email = computed(() => this.session()?.email ?? null);

  login(email: string, password: string): Observable<void> {
    return this.authenticate('login', { email, password });
  }

  register(email: string, password: string): Observable<void> {
    return this.authenticate('register', { email, password });
  }

  devLogin(): Observable<void> {
    return this.authenticate('dev-login');
  }

  logout(): void {
    this.setSession(null);
    this.router.navigate(['/login']);
  }

  private authenticate(path: string, body: object | null = null): Observable<void> {
    return this.http
      .post<Session>(AUTH_API + path, body)
      .pipe(map((session) => this.setSession(session)));
  }

  private setSession(session: Session | null): void {
    this.session.set(session);
    writeStored(STORAGE_KEY, session ? JSON.stringify(session) : null);
  }
}

function readStoredSession(): Session | null {
  try {
    const stored = readStored(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Session) : null;
  } catch {
    return null;
  }
}
