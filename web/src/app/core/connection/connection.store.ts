import { Injectable, signal } from '@angular/core';

/**
 * Conexión con el servidor perdida (S03). La marca el interceptor cuando una petición a la API
 * no obtiene respuesta (status 0); el shell muestra entonces el error de conexión en lugar de la
 * pantalla y «Reintentar» la vuelve a montar.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionStore {
  private readonly _lost = signal(false);
  readonly lost = this._lost.asReadonly();

  markLost(): void {
    this._lost.set(true);
  }

  reset(): void {
    this._lost.set(false);
  }
}
