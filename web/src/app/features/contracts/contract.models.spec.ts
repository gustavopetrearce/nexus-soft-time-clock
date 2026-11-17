import { contractPhase, fitsInProject, hrErrorMessage } from './contract.models';

describe('contract.models', () => {
  const project = { startsOn: '2026-01-01', endsOn: '2026-12-31' };

  it('el periodo cabe en la vigencia del proyecto (extremos inclusive)', () => {
    expect(fitsInProject('2026-01-01', '2026-12-31', project)).toBeTrue();
    expect(fitsInProject('2025-12-31', '2026-06-30', project)).toBeFalse();
    expect(fitsInProject('2026-03-01', '2027-01-01', project)).toBeFalse();
  });

  it('si el proyecto tiene fin, el contrato debe tenerlo; los extremos vacíos del proyecto no acotan', () => {
    expect(fitsInProject('2026-03-01', undefined, project)).toBeFalse();
    expect(fitsInProject('2020-01-01', undefined, {})).toBeTrue();
    expect(fitsInProject('2020-01-01', '2030-01-01', { endsOn: '2030-01-01' })).toBeTrue();
  });

  it('situación de un contrato según hoy; indefinido nunca concluye; cancelado no tiene', () => {
    const c = { startsOn: '2026-11-16', endsOn: '2026-11-20', status: 'ACTIVE' as const };
    expect(contractPhase(c, '2026-11-15')).toBe('UPCOMING');
    expect(contractPhase(c, '2026-11-20')).toBe('IN_PROGRESS');
    expect(contractPhase(c, '2026-11-21')).toBe('FINISHED');
    expect(contractPhase({ ...c, endsOn: undefined }, '2030-01-01')).toBe('IN_PROGRESS');
    expect(contractPhase({ ...c, status: 'CANCELLED' }, '2026-11-18')).toBeNull();
  });

  it('extrae el mensaje del módulo HR o del ProblemDetail', () => {
    expect(hrErrorMessage({ error: { error: ' Traslape ' } })).toBe('Traslape');
    expect(hrErrorMessage({ error: { detail: 'Otro' } })).toBe('Otro');
    expect(hrErrorMessage({ error: 'texto' })).toBeNull();
    expect(hrErrorMessage(null)).toBeNull();
  });
});
