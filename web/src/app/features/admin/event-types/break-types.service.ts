import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { BreakType } from './event-type.models';

/** Cliente REST de las categorías de descanso por empresa (V30). */
@Injectable({ providedIn: 'root' })
export class BreakTypesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/attendance/break-types`;

  list(): Observable<BreakType[]> {
    return this.http.get<BreakType[]>(this.base);
  }

  create(item: BreakType): Observable<BreakType> {
    return this.http.post<BreakType>(this.base, item);
  }

  update(item: BreakType): Observable<BreakType> {
    return this.http.put<BreakType>(`${this.base}/${item.id}`, item);
  }

  /** `deleted=false`: estaba en uso y el servidor solo la desactivó. */
  remove(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`);
  }
}
