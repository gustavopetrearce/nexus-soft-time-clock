import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { rangeParams } from '../report.service';
import { AttendanceRecordReport } from './attendance-records.models';

/**
 * Cliente REST del reporte de registros individuales de asistencia (RF-11). Requiere
 * {@code report:export}. Devuelve una fila por marcación; el filtrado, orden y paginación
 * finos se hacen en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceRecordsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  /** Registros en el rango [from, to] (fechas yyyy-MM-dd), con estado y proyecto opcionales. */
  records(from?: string, to?: string, status?: string, projectId?: string): Observable<AttendanceRecordReport[]> {
    return this.http.get<AttendanceRecordReport[]>(`${this.base}/attendance-records`, {
      params: rangeParams(from, to, projectId, status),
    });
  }
}
