import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { SUPPORTED_LOCALES } from '../models/locales';

const LANG_KEY = 'nexus.lang';

/** Región que usa `Intl` para cada idioma (es-MX conserva el formato que el panel ya mostraba). */
const INTL_LOCALE = { es: 'es-MX', en: 'en-US' } as const;

export type AppLang = 'es' | 'en';

/** Idioma por defecto y de respaldo: el producto nació en español. */
export const DEFAULT_LANG: AppLang = 'es';

export const APP_LANGS: readonly AppLang[] = SUPPORTED_LOCALES.map((l) => l.value as AppLang);

function isAppLang(value: string | null | undefined): value is AppLang {
  return !!value && (APP_LANGS as readonly string[]).includes(value);
}

/**
 * Idioma de la interfaz. Es una preferencia del dispositivo, como el tema: persiste en
 * localStorage y, sin elección guardada, sigue al navegador (si no es un idioma admitido, español).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  private readonly _lang = signal<AppLang>(LanguageService.initial());
  readonly lang = this._lang.asReadonly();
  /** Locale para `toLocaleString`/`Intl` según el idioma activo. */
  readonly intlLocale = computed(() => INTL_LOCALE[this._lang()]);

  private static initial(): AppLang {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANG_KEY);
    } catch {
      // Almacenamiento bloqueado: se sigue con el idioma del navegador.
    }
    if (isAppLang(stored)) return stored;
    const browser = (navigator.language ?? '').slice(0, 2).toLowerCase();
    return isAppLang(browser) ? browser : DEFAULT_LANG;
  }

  /**
   * Carga el diccionario activo (y el de respaldo) antes de pintar la app, para que las
   * traducciones síncronas de código (`translate()`) no devuelvan la clave en el primer render.
   */
  async init(): Promise<void> {
    const lang = this._lang();
    const loads = [firstValueFrom(this.transloco.load(lang))];
    if (lang !== DEFAULT_LANG) loads.push(firstValueFrom(this.transloco.load(DEFAULT_LANG)));
    await Promise.all(loads);
    this.apply(lang);
  }

  /**
   * Cambia de idioma. Primero carga el diccionario y después publica el cambio: las etiquetas
   * calculadas en código (`computed` que dependen de `lang`) se re-evalúan con el texto ya disponible.
   */
  async set(lang: AppLang): Promise<void> {
    if (lang === this._lang()) return;
    await firstValueFrom(this.transloco.load(lang));
    this._lang.set(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Sin persistencia: el cambio vale para esta sesión.
    }
    this.apply(lang);
  }

  private apply(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    document.documentElement.lang = lang;
  }
}
