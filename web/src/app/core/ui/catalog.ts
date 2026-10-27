import { WritableSignal, effect, inject, signal } from '@angular/core';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { AuthStore } from '../auth/auth.store';

/** Paginación de catálogos (HIFI/08, reglas comunes): 20 por defecto, opciones 10/20/50. */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];
export const DEFAULT_PAGE_SIZE = 20;

/** Espera de la búsqueda en el servidor mientras se escribe. */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * Tamaño de página recordado por usuario y por listado en el almacenamiento local del navegador
 * (clave con el id del usuario y el del listado). Sin valor guardado, o si no se puede leer, 20.
 * Debe llamarse en un contexto de inyección (constructor o inicializador de campo).
 */
export function pageSizePreference(listId: string): WritableSignal<number> {
  const store = inject(AuthStore);
  const key = () => `nexus.pageSize.${store.user()?.userId ?? 'anon'}.${listId}`;
  const size = signal(read(key()));

  // Cuando llega /me cambia la clave: se relee el valor del usuario real y se persisten los cambios.
  let lastKey = key();
  effect(() => {
    const current = key();
    if (current !== lastKey) {
      lastKey = current;
      size.set(read(current));
      return;
    }
    write(current, size());
  }, { allowSignalWrites: true });

  return size;
}

/** Texto de búsqueda listo para pedir al servidor: espera 400 ms y descarta repeticiones. */
export function debouncedSearch(input: Observable<string>): Observable<string> {
  return input.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged());
}

function read(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return PAGE_SIZE_OPTIONS.includes(value) ? value : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

function write(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): se queda en memoria.
  }
}
