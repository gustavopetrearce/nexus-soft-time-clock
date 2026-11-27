import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageResponse } from '../../core/models/common.models';
import { CreateSanction, Sanction, SanctionFilters } from './sanction.models';

/** Cliente REST de sanciones (V39). Todo requiere {@code sanction:manage}. */
@Injectable({ providedIn: 'root' })
export class SanctionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/sanctions`;

  list(page: number, size: number, filters: SanctionFilters): Observable<PageResponse<Sanction>> {
    const params = toParams(filters).set('page', page).set('size', size);
    return this.http.get<PageResponse<Sanction>>(this.base, { params });
  }

  /** Lista completa con los mismos filtros, para exportar en el cliente. */
  report(filters: SanctionFilters): Observable<Sanction[]> {
    return this.http.get<Sanction[]>(`${this.base}/report`, { params: toParams(filters) });
  }

  create(body: CreateSanction): Observable<Sanction> {
    return this.http.post<Sanction>(this.base, body);
  }

  void(id: string, reason: string): Observable<Sanction> {
    return this.http.patch<Sanction>(`${this.base}/${id}/void`, { reason });
  }
}

function toParams(filters: SanctionFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params = params.set(key, String(value).trim());
  }
  return params;
}
