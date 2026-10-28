import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from './language.service';

/**
 * Cifras con separador de miles según el idioma activo: es-MX (3,840) o en-US. El locale `es`
 * registrado en Angular agrupa con punto, por eso se formatea con Intl y no con `number`.
 */
@Pipe({ name: 'appNumber', standalone: true, pure: false })
export class AppNumberPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: number | null | undefined, maxFractionDigits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    const locale = this.language.lang() === 'en' ? 'en-US' : 'es-MX';
    return value.toLocaleString(locale, { maximumFractionDigits: maxFractionDigits });
  }
}
