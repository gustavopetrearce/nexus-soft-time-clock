import { AMERICA_TIMEZONES, timezoneOptions } from './timezones';

describe('timezoneOptions', () => {
  it('devuelve la lista curada, en orden y sin duplicados', () => {
    const values = timezoneOptions().map((o) => o.value);
    expect(values).toEqual([...AMERICA_TIMEZONES]);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual([...values].sort());
  });

  it('añade al final una zona que no está en la lista curada', () => {
    const values = timezoneOptions('Europe/Madrid').map((o) => o.value);
    expect(values.length).toBe(AMERICA_TIMEZONES.length + 1);
    expect(values[values.length - 1]).toBe('Europe/Madrid');
  });

  it('no duplica una zona que ya está en la lista curada', () => {
    const values = timezoneOptions('America/Lima').map((o) => o.value);
    expect(values).toEqual([...AMERICA_TIMEZONES]);
  });

  it('ignora un valor actual vacío o nulo', () => {
    expect(timezoneOptions('').length).toBe(AMERICA_TIMEZONES.length);
    expect(timezoneOptions(null).length).toBe(AMERICA_TIMEZONES.length);
    expect(timezoneOptions('   ').length).toBe(AMERICA_TIMEZONES.length);
  });

  it('etiqueta cada opción con su identificador y el offset vigente', () => {
    for (const option of timezoneOptions()) {
      expect(option.label).toMatch(/^\S+ \(UTC[+\u2212]\d{2}:\d{2}\)$/);
      expect(option.label.startsWith(option.value + ' ')).toBeTrue();
    }
    expect(timezoneOptions().find((o) => o.value === 'UTC')?.label).toBe('UTC (UTC+00:00)');
  });

  it('solo expone zonas que el backend puede resolver y que caben en varchar(64)', () => {
    for (const tz of AMERICA_TIMEZONES) {
      expect(tz.length).toBeLessThanOrEqual(64);
      // Equivalente en el navegador al ZoneId.of() del backend: lanza si la zona no existe.
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz })).not.toThrow();
    }
  });
});
