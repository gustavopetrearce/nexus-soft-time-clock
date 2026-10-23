import { translate } from '@jsverse/transloco';

/**
 * Traducción síncrona para código fuera de plantillas (mapas de etiquetas, exportaciones).
 * Devuelve `fallback` si la clave no existe o si Transloco no está inicializado (p. ej. en
 * pruebas unitarias que no lo proveen), así un texto nunca se muestra como `roles.X`.
 */
export function translateOr(key: string, fallback: string, params?: Record<string, unknown>): string {
  try {
    const text = translate(key, params);
    return text && text !== key ? text : fallback;
  } catch {
    return fallback;
  }
}
