import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AUTH_API, AuthService } from './auth.service';

/** Pieliek tokenu pieprasījumiem, un ja serveris saka 401, izlogo lietotāju */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  // Login pieprasījumiem tokenu nesūtām, jo vecs tokens dotu 401 un neļautu ieiet no jauna
  const token = request.url.startsWith(AUTH_API) ? null : auth.token();
  const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorized).pipe(
    catchError((error) => {
      if (token && error instanceof HttpErrorResponse && error.status === 401) auth.logout();
      return throwError(() => error);
    }),
  );
};
