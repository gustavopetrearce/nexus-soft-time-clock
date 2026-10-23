import { formatDate } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from './language.service';

/**
 * `date` que sigue al idioma activo. El pipe nativo usa el `LOCALE_ID` fijado al arrancar,
 * que no cambia en caliente; este es impuro para re-formatear cuando se cambia de idioma.
 */
@Pipe({ name: 'appDate', standalone: true, pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | number | Date | null | undefined, format = 'mediumDate', timezone?: string): string {
    if (value === null || value === undefined || value === '') return '';
    return formatDate(value, format, this.language.lang(), timezone);
  }
}
