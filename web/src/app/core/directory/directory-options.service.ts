import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Colaborador para un selector: solo lo necesario para elegirlo. */
export interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string | null;
}

/** Centro de trabajo para un selector. */
export interface WorkSiteOption {
  id: string;
  code: string;
  name: string;
}

/** "Nombre · código" para mostrar en un selector. */
export function employeeLabel(e: EmployeeOption): string {
  return e.employeeCode ? `${e.fullName} · ${e.employeeCode}` : e.fullName;
}

/**
 * Selectores de colaboradores y centros (GET /options/*) para formularios de RR. HH. y supervisión
 * —permisos, vacaciones, turnos—, que no exigen administrar usuarios ni centros. Los listados
 * completos de `/users` y `/work-sites` siguen siendo solo para quien los administra.
 */
@Injectable({ providedIn: 'root' })
export class DirectoryOptionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/options`;

  employees(search?: string, limit = 500): Observable<EmployeeOption[]> {
    let params = new HttpParams().set('limit', limit);
    if (search?.trim()) params = params.set('search', search.trim());
    return this.http.get<EmployeeOption[]>(`${this.base}/employees`, { params });
  }

  workSites(): Observable<WorkSiteOption[]> {
    return this.http.get<WorkSiteOption[]>(`${this.base}/work-sites`);
  }
}
