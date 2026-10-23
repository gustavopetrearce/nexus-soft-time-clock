import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';

import en from '../../../../public/i18n/en.json';
import es from '../../../../public/i18n/es.json';
import { localizedProblem } from '../ui/problem-detail';
import { translateOr } from './translate-or';

/** Claves hoja de un diccionario anidado, en notación con puntos. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('es.json y en.json tienen exactamente las mismas claves', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  describe('con Transloco', () => {
    let transloco: TranslocoService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [
          TranslocoTestingModule.forRoot({
            langs: { es, en },
            translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
            preloadLangs: true,
          }),
        ],
      });
      transloco = TestBed.inject(TranslocoService);
    });

    const conflict = new HttpErrorResponse({
      status: 409,
      error: { code: 'CAPACITY_EXCEEDED', detail: 'La empresa alcanzó su cupo: límite 150, usados 150.' },
    });

    it('en español conserva el detalle del backend', () => {
      transloco.setActiveLang('es');
      expect(localizedProblem(transloco, conflict, 'errors.generic')).toContain('límite 150');
    });

    it('en inglés traduce por código', () => {
      transloco.setActiveLang('en');
      expect(localizedProblem(transloco, conflict, 'errors.generic')).toBe(
        'The company has reached its active employee capacity.',
      );
    });

    it('en inglés, sin código conocido, usa el texto de respaldo traducido', () => {
      transloco.setActiveLang('en');
      const unknown = new HttpErrorResponse({ status: 500, error: { code: 'NOPE', detail: 'Falla interna' } });
      expect(localizedProblem(transloco, unknown, 'errors.generic')).toBe('An unexpected error occurred.');
    });

    it('translateOr traduce y cae en el respaldo si falta la clave', () => {
      transloco.setActiveLang('en');
      expect(translateOr('roles.EMPLOYEE', 'Colaborador')).toBe('Employee');
      expect(translateOr('roles.UNKNOWN', 'UNKNOWN')).toBe('UNKNOWN');
    });
  });
});
