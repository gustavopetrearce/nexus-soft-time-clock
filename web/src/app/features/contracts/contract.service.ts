import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageResponse } from '../../core/models/common.models';
import { Contract, ContractFilters, ContractOptions, CreateContract, UpdateContract } from './contract.models';

/** Cliente REST de contratos de colaboradores (RF-30). Todo requiere {@code contract:manage}. */
@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/contracts`;

  list(page: number, size: number, filters: ContractFilters): Observable<PageResponse<Contract>> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, String(value).trim());
    }
    return this.http.get<PageResponse<Contract>>(this.base, { params });
  }

  /** Historial de un colaborador. */
  forUser(userId: string): Observable<Contract[]> {
    return this.http.get<Contract[]>(`${environment.apiBaseUrl}/users/${userId}/contracts`);
  }

  /** Colaboradores, proyectos y centros para el formulario. */
  options(): Observable<ContractOptions> {
    return this.http.get<ContractOptions>(`${this.base}/options`);
  }

  create(body: CreateContract): Observable<Contract> {
    return this.http.post<Contract>(this.base, body);
  }

  update(id: string, body: UpdateContract): Observable<Contract> {
    return this.http.put<Contract>(`${this.base}/${id}`, body);
  }

  end(id: string, endDate: string): Observable<Contract> {
    return this.http.patch<Contract>(`${this.base}/${id}/end`, { endDate });
  }

  cancel(id: string, reason: string): Observable<Contract> {
    return this.http.patch<Contract>(`${this.base}/${id}/cancel`, { reason });
  }
}
