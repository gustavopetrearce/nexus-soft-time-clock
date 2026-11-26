import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ImportResponse, ImportRowRequest } from './user-import.models';

/** Cliente de `POST /users/import` (iteración 15). Requiere {@code user:manage}. */
@Injectable({ providedIn: 'root' })
export class UserImportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/users/import`;

  /** Vista previa: el servidor valida todo el archivo y no escribe nada. */
  preview(rows: ImportRowRequest[]): Observable<ImportResponse> {
    return this.post(rows, true);
  }

  /**
   * Confirmación. Si entre la vista previa y este paso algo cambió (otra alta con el mismo correo),
   * el servidor responde 422 con los errores: se devuelven como respuesta normal, no como fallo.
   */
  commit(rows: ImportRowRequest[]): Observable<ImportResponse> {
    return this.post(rows, false).pipe(
      catchError((err: unknown) =>
        err instanceof HttpErrorResponse && err.status === 422 && Array.isArray(err.error?.issues)
          ? of(err.error as ImportResponse)
          : throwError(() => err),
      ),
    );
  }

  private post(rows: ImportRowRequest[], dryRun: boolean): Observable<ImportResponse> {
    const params = new HttpParams().set('dryRun', dryRun);
    return this.http.post<ImportResponse>(this.url, { rows }, { params });
  }
}
