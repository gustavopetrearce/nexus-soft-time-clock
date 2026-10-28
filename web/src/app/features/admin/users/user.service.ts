import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PageResponse } from '../../../core/models/common.models';
import { CreateUser, User, UserListFilters, UserStatus } from './user.models';

/** Cliente REST de administración de usuarios del tenant (RF-06, RF-22). Requiere {@code user:manage}. */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;

  /**
   * Listado paginado. `search` cubre nombre, apellidos y correo; `filters` acota por código de
   * empleado (parcial), estado y rol, todo en el servidor (P20).
   */
  list(page = 0, size = 20, search?: string, filters: UserListFilters = {}): Observable<PageResponse<User>> {
    let params = new HttpParams().set('page', page).set('size', size);
    const all: Record<string, string | undefined> = { search, ...filters };
    for (const [key, value] of Object.entries(all)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<PageResponse<User>>(this.base, { params });
  }

  get(id: string): Observable<User> {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  create(request: CreateUser): Observable<User> {
    return this.http.post<User>(this.base, request);
  }

  updateStatus(id: string, status: UserStatus): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/status`, { status });
  }

  assignRoles(id: string, roleCodes: string[]): Observable<User> {
    return this.http.put<User>(`${this.base}/${id}/roles`, { roleCodes });
  }

  /** Restablece la contraseña de un usuario (operación administrativa, requiere user:manage). */
  resetPassword(id: string, newPassword: string): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/password`, { newPassword });
  }
}
