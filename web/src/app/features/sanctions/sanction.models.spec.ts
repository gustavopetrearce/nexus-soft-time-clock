import { sanctionStatusTone, suspensionEnd } from './sanction.models';

describe('sanction.models', () => {
  it('calcula el último día de la suspensión (inclusive), también entre meses', () => {
    expect(suspensionEnd('2026-11-23', 3)).toBe('2026-11-25');
    expect(suspensionEnd('2026-11-30', 2)).toBe('2026-12-01');
    expect(suspensionEnd('2026-11-23', 1)).toBe('2026-11-23');
  });

  it('sin inicio o sin días no hay fin', () => {
    expect(suspensionEnd(undefined, 3)).toBe('');
    expect(suspensionEnd('2026-11-23', 0)).toBe('');
  });

  it('vigente en aviso, anulada neutra', () => {
    expect(sanctionStatusTone('ACTIVE')).toBe('PENDING_REVIEW');
    expect(sanctionStatusTone('VOIDED')).toBe('INACTIVE');
  });
});
