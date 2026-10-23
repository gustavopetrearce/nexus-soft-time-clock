import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';

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

/**
 * `problemMessage` según el idioma activo. El `detail` del backend llega siempre en español:
 * en español se sigue mostrando (conserva las cifras concretas); en otro idioma se traduce por
 * `code` (`errors.<CODE>`) y, si el código no tiene traducción, se usa el texto de `fallbackKey`.
 */
export function localizedProblem(transloco: TranslocoService, error: unknown, fallbackKey: string): string {
  const lang = transloco.getActiveLang();
  if (lang === 'es') return problemMessage(error, transloco.translate(fallbackKey));
  const code = problemCode(error);
  if (code) {
    const key = `errors.${code}`;
    const text = transloco.getTranslation(lang)?.[key];
    if (typeof text === 'string' && text) return text;
  }
  return transloco.translate(fallbackKey);
}
