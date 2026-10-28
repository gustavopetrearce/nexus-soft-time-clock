import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { ConnectionStore } from '../connection/connection.store';

/**
 * Adjunta el Bearer JWT y, ante un 401, intenta renovar la sesión con el refresh token
 * y reintenta la petición original una vez (ADR-007). Si el refresh falla, limpia la sesión.
 *
 * El token viaja **solo** a la API propia. Enviarlo a otros destinos —en particular al object
 * storage de evidencias, cuyas URLs llevan la firma en la query-string— haría que el servidor
 * rechazara la petición por llevar dos credenciales, además de filtrar el token fuera del backend.
 *
 * Una petición a la API sin respuesta (status 0: servidor caído o sin red) marca la conexión como
 * perdida para que el shell muestre S03. Login y refresh quedan fuera: el login muestra su propio aviso.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const authService = inject(AuthService);
  const connection = inject(ConnectionStore);

  const isApiRequest = req.url.startsWith(environment.apiBaseUrl);
  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
  const shouldAuthenticate = isApiRequest && !isAuthEndpoint;
  const token = store.accessToken();
  const authReq =
    token && shouldAuthenticate
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0 && shouldAuthenticate) {
        connection.markLost();
      }
      if (error.status === 401 && shouldAuthenticate && store.refreshTokenValue()) {
        return authService.refresh().pipe(
          switchMap((tokens) =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } })),
          ),
          catchError((refreshError) => {
            store.clear();
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
