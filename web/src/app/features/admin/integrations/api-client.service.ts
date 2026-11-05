import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiClient, ApiClientCredentials } from './api-client.models';

/** Cliente REST de credenciales de sistemas externos (ADR-013). Requiere {@code integration:manage}. */
@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/integrations/clients`;

  list(): Observable<ApiClient[]> {
    return this.http.get<ApiClient[]>(this.base);
  }

  create(name: string): Observable<ApiClientCredentials> {
    return this.http.post<ApiClientCredentials>(this.base, { name });
  }

  rotateSecret(id: string): Observable<ApiClientCredentials> {
    return this.http.post<ApiClientCredentials>(`${this.base}/${id}/rotate-secret`, null);
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
