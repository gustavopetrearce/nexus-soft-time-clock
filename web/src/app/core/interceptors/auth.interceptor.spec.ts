import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
import { ConnectionStore } from '../connection/connection.store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).setTokens({ accessToken: 'token-de-prueba', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 });
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('adjunta el Bearer a las peticiones de la API', () => {
    http.get(`${environment.apiBaseUrl}/attendance/me`).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/attendance/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-de-prueba');
    req.flush({});
  });

  // Una URL prefirmada lleva la firma en la query-string: añadirle el Bearer hace que el
  // object storage rechace la petición, además de filtrar el token fuera del backend.
  it('NO adjunta el Bearer a una URL prefirmada del storage de evidencias', () => {
    const signed = 'http://localhost:9000/evidence/t/x/y.jpg?X-Amz-Signature=abc';
    http.get(signed).subscribe();

    const req = httpMock.expectOne(signed);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('no intenta renovar la sesión ante un 401 de un destino externo', () => {
    const signed = 'http://localhost:9000/evidence/t/x/y.jpg?X-Amz-Signature=abc';
    http.get(signed).subscribe({ error: () => undefined });

    httpMock.expectOne(signed).flush('denegado', { status: 401, statusText: 'Unauthorized' });

    // expectNone no cuenta como aserción en Jasmine, así que se comprueba explícitamente.
    expect(httpMock.match(`${environment.apiBaseUrl}/auth/refresh`).length).toBe(0);
  });

  it('marca la conexión como perdida si la API no responde (S03)', () => {
    http.get(`${environment.apiBaseUrl}/attendance/me`).subscribe({ error: () => undefined });

    httpMock.expectOne(`${environment.apiBaseUrl}/attendance/me`).error(new ProgressEvent('error'), { status: 0 });

    expect(TestBed.inject(ConnectionStore).lost()).toBeTrue();
  });

  it('no marca la conexión desde el login: tiene su propio aviso', () => {
    http.post(`${environment.apiBaseUrl}/auth/login`, {}).subscribe({ error: () => undefined });

    httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`).error(new ProgressEvent('error'), { status: 0 });

    expect(TestBed.inject(ConnectionStore).lost()).toBeFalse();
  });
});
