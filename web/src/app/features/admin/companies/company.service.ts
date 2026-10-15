import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PageResponse } from '../../../core/models/common.models';
import {
  Company,
  CompanyStatus,
  CreateCompany,
  ProvisionAdmin,
  ProvisionedAdmin,
  TenantCapacity,
  UpdateCompany,
} from './company.models';

/** Cliente REST de administración de empresas (RF-13). */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/companies`;

  list(page = 0, size = 20, search?: string): Observable<PageResponse<Company>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PageResponse<Company>>(this.base, { params });
  }

  get(id: string): Observable<Company> {
    return this.http.get<Company>(`${this.base}/${id}`);
  }

  /** Empresa del tenant autenticado (para el shell), sin requerir company:manage. */
  getMine(): Observable<Company> {
    return this.http.get<Company>(`${this.base}/me`);
  }

  create(request: CreateCompany): Observable<Company> {
    return this.http.post<Company>(this.base, request);
  }

  update(id: string, request: UpdateCompany): Observable<Company> {
    return this.http.put<Company>(`${this.base}/${id}`, request);
  }

  setStatus(id: string, status: CompanyStatus): Observable<Company> {
    return this.http.patch<Company>(`${this.base}/${id}/status`, { status });
  }

  /** Cupo de colaboradores activos de una empresa (SUPER_ADMIN, permiso company:capacity). */
  getCapacity(id: string): Observable<TenantCapacity> {
    return this.http.get<TenantCapacity>(`${this.base}/${id}/capacity`);
  }

  /**
   * Cupo de varias empresas en una sola petición: el listado necesita el consumo de toda la
   * página y pedirlo fila por fila sería un N+1 por pantalla.
   */
  getCapacities(ids: string[]): Observable<TenantCapacity[]> {
    if (!ids.length) {
      return of([]);
    }
    const params = new HttpParams().set('ids', ids.join(','));
    return this.http.get<TenantCapacity[]>(`${this.base}/capacities`, { params });
  }

  /** Fija el total de bloques adicionales contratados (no un incremento). */
  setExtraBlocks(id: string, extraBlocks: number): Observable<TenantCapacity> {
    return this.http.put<TenantCapacity>(`${this.base}/${id}/capacity`, { extraBlocks });
  }

  /** Cupo de la propia empresa, en modo lectura, para quien administra sus colaboradores. */
  getMyCapacity(): Observable<TenantCapacity> {
    return this.http.get<TenantCapacity>(`${this.base}/me/capacity`);
  }

  /** Aprovisiona el administrador inicial (COMPANY_ADMIN) de la empresa (solo SUPER_ADMIN). */
  provisionAdmin(companyId: string, request: ProvisionAdmin): Observable<ProvisionedAdmin> {
    return this.http.post<ProvisionedAdmin>(`${this.base}/${companyId}/admin`, request);
  }
}
