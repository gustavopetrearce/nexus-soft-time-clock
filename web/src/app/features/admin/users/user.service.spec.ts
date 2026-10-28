import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { UserService } from './user.service';

describe('UserService.list', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía búsqueda y filtros de P20 como parámetros del servidor', () => {
    service.list(1, 20, 'ana', { employeeCode: 'EMP-01', status: 'ACTIVE', role: 'SUPERVISOR' }).subscribe();

    const req = http.expectOne((r) => r.url === `${environment.apiBaseUrl}/users`);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('search')).toBe('ana');
    expect(req.request.params.get('employeeCode')).toBe('EMP-01');
    expect(req.request.params.get('status')).toBe('ACTIVE');
    expect(req.request.params.get('role')).toBe('SUPERVISOR');
    req.flush({ content: [], page: 1, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('omite los filtros vacíos', () => {
    service.list(0, 20, undefined, { employeeCode: '', status: '', role: '' }).subscribe();

    const req = http.expectOne((r) => r.url === `${environment.apiBaseUrl}/users`);
    expect(req.request.params.keys().sort()).toEqual(['page', 'size']);
    req.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });
});
