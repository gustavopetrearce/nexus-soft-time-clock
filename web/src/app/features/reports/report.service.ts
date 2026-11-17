import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AttendanceReport, ProjectHours, ReportProject } from './report.models';

/**
 * Cliente REST del reporte agregado de asistencia (RF-11). Requiere {@code report:export}.
 * Devuelve el conjunto por colaborador; el filtrado, ordenamiento y exportación son client-side.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  /** Reporte agregado por colaborador en el rango [from, to] (fechas yyyy-MM-dd), opcionalmente de un proyecto. */
  summary(from?: string, to?: string, projectId?: string): Observable<AttendanceReport[]> {
    return this.http.get<AttendanceReport[]>(`${this.base}/attendance-summary`, { params: rangeParams(from, to, projectId) });
  }

  /** Horas por colaborador y proyecto (CU-09); el proyecto nulo agrupa las horas sin proyecto. */
  hoursByProject(from?: string, to?: string, projectId?: string): Observable<ProjectHours[]> {
    return this.http.get<ProjectHours[]>(`${this.base}/hours-by-project`, { params: rangeParams(from, to, projectId) });
  }

  /** Proyectos para el filtro: basta report:export. */
  projects(): Observable<ReportProject[]> {
    return this.http.get<ReportProject[]>(`${this.base}/projects`);
  }
}

/** Parámetros comunes de los reportes; los vacíos no se envían. */
export function rangeParams(from?: string, to?: string, projectId?: string, status?: string): HttpParams {
  let params = new HttpParams();
  if (from) params = params.set('from', from);
  if (to) params = params.set('to', to);
  if (projectId) params = params.set('projectId', projectId);
  if (status) params = params.set('status', status);
  return params;
}
