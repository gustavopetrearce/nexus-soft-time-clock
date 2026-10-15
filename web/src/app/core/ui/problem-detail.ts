import { HttpErrorResponse } from '@angular/common/http';

/** Cuerpo de error uniforme del backend (RFC 7807 + `code` de negocio). */
export interface ProblemDetail {
  detail?: string;
  title?: string;
  code?: string;
}

function body(error: unknown): ProblemDetail | null {
  if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object') {
    return error.error as ProblemDetail;
  }
  return null;
}

/**
 * Mensaje que ve la persona ante un error de la API.
 *
 * El backend ya explica el porqué con números concretos —"límite 150, usados 150, disponibles 0"—
 * y perder eso a cambio de un "no se pudo guardar" deja a quien administra sin saber qué hacer.
 * El texto genérico queda solo para errores sin cuerpo (red caída, 500 opaco).
 */
export function problemMessage(error: unknown, fallback: string): string {
  return body(error)?.detail?.trim() || fallback;
}

/** Código de negocio del error (`CAPACITY_EXCEEDED`, `DUPLICATE_EMAIL`…), si el backend lo envió. */
export function problemCode(error: unknown): string | null {
  return body(error)?.code ?? null;
}
