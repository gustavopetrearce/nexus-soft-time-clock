/**
 * Catálogo de zonas horarias del panel.
 *
 * El backend acepta cualquier cadena: los DTOs no validan y las columnas son `varchar(64)` sin
 * CHECK, así que una zona mal escrita se guarda sin error y `ShiftZoneAdapter` la degrada a UTC en
 * silencio al evaluar la ventana del turno. Cerrar la lista aquí es lo único que impide llegar a
 * ese estado. Es un conjunto finito y conocido, por eso vive en el cliente y no se persiste.
 */

export interface TimezoneOption {
  /** Identificador IANA tal cual lo guarda el backend. */
  value: string;
  /** Identificador más el offset vigente, p. ej. `America/Lima (UTC−05:00)`. */
  label: string;
}

/** Zonas IANA de América admitidas por el panel, ordenadas por identificador. */
export const AMERICA_TIMEZONES: readonly string[] = [
  'America/Argentina/Buenos_Aires',
  'America/Asuncion',
  'America/Belize',
  'America/Bogota',
  'America/Cancun',
  'America/Caracas',
  'America/Chicago',
  'America/Chihuahua',
  'America/Costa_Rica',
  'America/Cuiaba',
  'America/Denver',
  'America/El_Salvador',
  'America/Guatemala',
  'America/Guayaquil',
  'America/Guyana',
  'America/Havana',
  'America/Hermosillo',
  'America/Jamaica',
  'America/La_Paz',
  'America/Lima',
  'America/Los_Angeles',
  'America/Managua',
  'America/Manaus',
  'America/Mazatlan',
  'America/Merida',
  'America/Mexico_City',
  'America/Monterrey',
  'America/Montevideo',
  'America/New_York',
  'America/Panama',
  'America/Paramaribo',
  'America/Phoenix',
  'America/Puerto_Rico',
  'America/Punta_Arenas',
  'America/Recife',
  'America/Regina',
  'America/Santiago',
  'America/Santo_Domingo',
  'America/Sao_Paulo',
  'America/St_Johns',
  'America/Tegucigalpa',
  'America/Tijuana',
  'America/Toronto',
  'America/Vancouver',
  'Pacific/Easter',
  'Pacific/Galapagos',
  'UTC',
];

/** El offset depende del horario de verano, así que se calcula para hoy en vez de fijarlo. */
const labelCache = new Map<string, string>();

/** Etiqueta «Zona (UTC±HH:MM)»; si el runtime no conoce la zona, solo el identificador. */
function timezoneLabel(tz: string): string {
  const cached = labelCache.get(tz);
  if (cached !== undefined) {
    return cached;
  }
  let label = tz;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date());
    // 'GMT-06:00', o 'GMT' a secas cuando el offset es cero.
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const offset = name === 'GMT' ? '+00:00' : name.replace('GMT', '');
    if (/^[+-]\d{2}:\d{2}$/.test(offset)) {
      label = tz + ' (UTC' + offset.replace('-', '\u2212') + ')';
    }
  } catch {
    // Zona desconocida para el navegador: se muestra pelada en lugar de romper el desplegable.
  }
  labelCache.set(tz, label);
  return label;
}

/**
 * Opciones del desplegable. `current` se añade al final si no está en la lista curada —una empresa
 * migrada con `Europe/Madrid`, o un valor sembrado a mano— para que abrir el formulario no deje el
 * campo vacío y guardar no borre el dato en silencio.
 */
export function timezoneOptions(current?: string | null): TimezoneOption[] {
  const options = AMERICA_TIMEZONES.map((value) => ({ value, label: timezoneLabel(value) }));
  const tz = current?.trim();
  if (tz && !AMERICA_TIMEZONES.includes(tz)) {
    options.push({ value: tz, label: timezoneLabel(tz) });
  }
  return options;
}

/** Zona IANA del navegador, o UTC si el entorno no la expone. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
