import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageResponse } from '../../core/models/common.models';
import {
  CancellationResolution,
  CreateVacationRequest,
  ResolveVacation,
  VacationRequest,
  VacationStatus,
} from './vacation.models';

/**
 * Cliente REST de solicitudes de vacaciones (RF-09 ampliado).
 * La bandeja de aprobación requiere {@code vacation:approve}; el alta {@code vacation:request}.
 */
@Injectable({ providedIn: 'root' })
export class VacationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/vacations/requests`;

  /** @param cancellationPending solo las que tienen una cancelación pedida sin resolver. */
  list(
    page = 0,
    size = 20,
    status?: VacationStatus | '',
    search?: string,
    cancellationPending = false,
  ): Observable<PageResponse<VacationRequest>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    if (cancellationPending) {
      params = params.set('cancellation', 'PENDING');
    }
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PageResponse<VacationRequest>>(this.base, { params });
  }

  create(request: CreateVacationRequest): Observable<VacationRequest> {
    return this.http.post<VacationRequest>(this.base, request);
  }

  resolve(id: string, body: ResolveVacation): Observable<VacationRequest> {
    return this.http.patch<VacationRequest>(`${this.base}/${id}/resolve`, body);
  }

  /** Aceptar (queda CANCELLED) o denegar la cancelación que pidió el colaborador. */
  resolveCancellation(id: string, resolution: CancellationResolution, note?: string): Observable<VacationRequest> {
    return this.http.patch<VacationRequest>(`${this.base}/${id}/cancellation/resolve`, { resolution, note: note || undefined });
  }
}
