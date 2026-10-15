import { HttpErrorResponse } from '@angular/common/http';

import { problemCode, problemMessage } from './problem-detail';

describe('problem-detail', () => {
  function conflict(code: string, detail: string): HttpErrorResponse {
    return new HttpErrorResponse({ status: 409, error: { code, detail, title: 'Conflicto' } });
  }

  it('devuelve el detalle del backend en vez del texto genérico', () => {
    const error = conflict(
      'CAPACITY_EXCEEDED',
      'La empresa alcanzó su cupo de colaboradores activos: límite 150, usados 150, disponibles 0.',
    );

    expect(problemMessage(error, 'No se pudo crear el usuario.')).toContain('límite 150');
    expect(problemCode(error)).toBe('CAPACITY_EXCEEDED');
  });

  it('cae en el texto genérico cuando el error no trae cuerpo', () => {
    const sinCuerpo = new HttpErrorResponse({ status: 0, error: null });

    expect(problemMessage(sinCuerpo, 'No se pudo crear el usuario.')).toBe(
      'No se pudo crear el usuario.',
    );
    expect(problemCode(sinCuerpo)).toBeNull();
  });

  it('ignora un detalle vacío y no se rompe con errores que no son HTTP', () => {
    const vacio = new HttpErrorResponse({ status: 500, error: { detail: '   ' } });

    expect(problemMessage(vacio, 'Error genérico.')).toBe('Error genérico.');
    expect(problemMessage(new Error('boom'), 'Error genérico.')).toBe('Error genérico.');
    expect(problemCode(undefined)).toBeNull();
  });
});
