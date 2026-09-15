import { SUPPORTED_LOCALES, localeOptions } from './locales';

describe('localeOptions', () => {
  it('devuelve la lista de idiomas admitidos', () => {
    expect(localeOptions().map((o) => o.value)).toEqual(['es', 'en']);
  });

  it('añade al final un idioma que no está en la lista', () => {
    const options = localeOptions('fr-CA');
    expect(options.length).toBe(SUPPORTED_LOCALES.length + 1);
    expect(options[options.length - 1]).toEqual({ value: 'fr-CA', label: 'fr-CA' });
  });

  it('no duplica un idioma que ya está en la lista', () => {
    expect(localeOptions('es').map((o) => o.value)).toEqual(['es', 'en']);
  });

  it('ignora un valor actual vacío o nulo', () => {
    expect(localeOptions('').length).toBe(SUPPORTED_LOCALES.length);
    expect(localeOptions(null).length).toBe(SUPPORTED_LOCALES.length);
    expect(localeOptions('   ').length).toBe(SUPPORTED_LOCALES.length);
  });

  it('solo expone códigos que caben en varchar(10) y que Intl sabe resolver', () => {
    for (const { value, label } of SUPPORTED_LOCALES) {
      expect(value.length).toBeLessThanOrEqual(10);
      expect(label.startsWith(value + ' (')).toBeTrue();
      expect(() => new Intl.Locale(value)).not.toThrow();
    }
  });

  it('no muta la lista compartida entre llamadas', () => {
    localeOptions('fr-CA');
    expect(SUPPORTED_LOCALES.length).toBe(2);
    expect(localeOptions().length).toBe(2);
  });
});
