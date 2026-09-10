import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { QrRequest, QrToken } from '../work-sites/geofence/geofence.models';

/**
 * QR de empresa: el cartel que no pertenece a ningún centro y habilita el registro sin validación
 * de geocerca. Mismo contrato de vigencia que el QR de centro, pero fuera del árbol de centros.
 * Requiere `geofence:manage` y que la empresa tenga habilitado el registro sin centro.
 */
@Injectable({ providedIn: 'root' })
export class CompanyQrService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/company/qr`;

  generate(request?: QrRequest): Observable<QrToken> {
    return this.http.post<QrToken>(this.base, request ?? {});
  }
}
