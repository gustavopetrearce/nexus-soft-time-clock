import { TranslocoTestingModule, TranslocoTestingOptions } from '@jsverse/transloco';

import en from '../../../../public/i18n/en.json';
import es from '../../../../public/i18n/es.json';

/**
 * Transloco para pruebas unitarias con los diccionarios reales, ya cargados y en español
 * (los specs afirman sobre los textos que ve el usuario). Solo lo importan los `*.spec.ts`.
 */
export function translocoTesting(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { es, en },
    translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
    preloadLangs: true,
    ...options,
  });
}
