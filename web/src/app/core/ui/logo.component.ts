import { Component, input } from '@angular/core';

/** Archivo intercambiable del logotipo (provisional, IDENT/03) y id del símbolo que contiene. */
const LOGO_URL = 'brand/logo.svg';
const SPRITE_ID = 'nx-logo-sprite';

/**
 * Inserta una sola vez el archivo del logotipo como sprite oculto en el documento: así el
 * símbolo hereda los tokens --nx-* de la página (con `<use>` a un archivo externo no los toma).
 */
function ensureSprite(): void {
  if (document.getElementById(SPRITE_ID)) return;
  const holder = document.createElement('div');
  holder.id = SPRITE_ID;
  holder.hidden = true;
  holder.setAttribute('aria-hidden', 'true');
  document.body.prepend(holder);
  void fetch(LOGO_URL)
    .then((r) => (r.ok ? r.text() : ''))
    .then((svg) => (holder.innerHTML = svg))
    .catch(() => void 0);
}

/**
 * Isotipo de la marca (DS/04 · logotipo). El dibujo vive en `public/brand/logo.svg`: si cambia la
 * marca, solo se sustituye ese archivo (con un `<symbol id="iso">`). Los colores llegan por tokens.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  styles: [
    `
      :host { display: inline-flex; flex: none; }
      svg { width: var(--nx-icon-size-lg); height: var(--nx-icon-size-lg); }
      :host(.md) svg { width: var(--nx-icon-size-xl); height: var(--nx-icon-size-xl); }
      :host(.xl) svg { width: var(--nx-space-16); height: var(--nx-space-16); }
    `,
  ],
  template: `<svg viewBox="0 0 64 64" [attr.aria-hidden]="label() ? null : 'true'" [attr.aria-label]="label()" [attr.role]="label() ? 'img' : null"><use href="#iso" /></svg>`,
})
export class LogoComponent {
  constructor() {
    ensureSprite();
  }

  /** Nombre accesible; vacío cuando el logo acompaña al nombre escrito. */
  readonly label = input<string | null>(null);
}
