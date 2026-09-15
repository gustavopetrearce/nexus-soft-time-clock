/**
 * Catálogo de idiomas de la empresa.
 *
 * Mismo problema que las zonas horarias: el backend no valida el campo —`CompanyRequest.locale` no
 * lleva anotaciones y la columna es `varchar(10)` sin CHECK—, así que un texto libre admite
 * «español», «ES» o «spanish», valores que nada del sistema sabe resolver.
 *
 * La lista es la de los idiomas que el producto realmente traduce: `mobile/lib/l10n` contiene
 * `app_es.arb` y `app_en.arb`, y coincide con el `DEFAULT 'es'` de la columna. Añadir un idioma es
 * añadir su `.arb` y una entrada aquí. Es finita y conocida, por eso vive en el cliente.
 */

export interface LocaleOption {
  /** Código BCP 47 tal cual lo guarda el backend. */
  value: string;
  /** Código más el idioma en su propia lengua, p. ej. `es (Español)`. */
  label: string;
}

/** Idiomas admitidos por el panel, en el orden en que se ofrecen. */
export const SUPPORTED_LOCALES: readonly LocaleOption[] = [
  { value: 'es', label: 'es (Español)' },
  { value: 'en', label: 'en (English)' },
];

/**
 * Opciones del desplegable. `current` se añade al final si no está en la lista —un valor sembrado a
 * mano o heredado de cuando el campo era texto libre— para que abrir el formulario no deje el campo
 * vacío y guardar no borre el dato en silencio.
 */
export function localeOptions(current?: string | null): LocaleOption[] {
  const options = SUPPORTED_LOCALES.map((o) => ({ ...o }));
  const locale = current?.trim();
  if (locale && !SUPPORTED_LOCALES.some((o) => o.value === locale)) {
    options.push({ value: locale, label: locale });
  }
  return options;
}
