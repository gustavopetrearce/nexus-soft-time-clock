/**
 * Valor actual de un token `--nx-*` (p. ej. `cssToken('color-action-primary')`), para APIs que no
 * aceptan var() como los estilos de Leaflet. Se lee de <body> para respetar el tema oscuro.
 */
export function cssToken(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(`--nx-${name}`).trim();
}
