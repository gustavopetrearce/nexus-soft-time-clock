import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageResponse } from '../../core/models/common.models';
import { CreatePermit, PayStatus, Permit, PermitFilters } from './permit.models';

/**
 * Cliente REST de permisos. Bandeja, alta y cancelación: {@code permit:manage}; goce de sueldo:
 * {@code permit:pay} (solo RR. HH.).
 */
@Injectable({ providedIn: 'root' })
export class PermitService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/permits`;

  list(page: number, size: number, filters: PermitFilters): Observable<PageResponse<Permit>> {
    const params = toParams(filters).set('page', page).set('size', size);
    return this.http.get<PageResponse<Permit>>(this.base, { params });
  }

  /** Reporte de incapacidades completo (sin paginar): se filtra, ordena y exporta en el cliente. */
  incapacities(filters: Pick<PermitFilters, 'from' | 'to' | 'status'>): Observable<Permit[]> {
    return this.http.get<Permit[]>(`${this.base}/incapacities`, { params: toParams(filters) });
  }

  create(body: CreatePermit): Observable<Permit> {
    return this.http.post<Permit>(this.base, body);
  }

  cancel(id: string, note?: string): Observable<Permit> {
    return this.http.patch<Permit>(`${this.base}/${id}/cancel`, { note: note || undefined });
  }

  /** Aprobar o rechazar una solicitud de incapacidad del colaborador (PENDING). */
  resolve(id: string, resolution: 'APPROVED' | 'REJECTED', note?: string): Observable<Permit> {
    return this.http.patch<Permit>(`${this.base}/${id}/resolve`, { resolution, note: note || undefined });
  }

  decidePay(id: string, payStatus: Exclude<PayStatus, 'PENDING_REVIEW'>, note?: string): Observable<Permit> {
    return this.http.patch<Permit>(`${this.base}/${id}/pay`, { payStatus, note: note || undefined });
  }
}

function toParams(filters: PermitFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params = params.set(key, String(value).trim());
  }
  return params;
}
