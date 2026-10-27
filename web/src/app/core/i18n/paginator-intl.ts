import { Injectable, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Textos de la paginación (HIFI/08: "Filas por página" y el total con cifras es-MX) en el idioma
 * activo; se re-etiqueta al cambiar de idioma.
 */
@Injectable()
export class TranslocoPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    this.transloco.langChanges$.subscribe(() => {
      this.itemsPerPageLabel = this.transloco.translate('common.paginator.rows');
      this.nextPageLabel = this.transloco.translate('common.paginator.next');
      this.previousPageLabel = this.transloco.translate('common.paginator.previous');
      this.firstPageLabel = this.transloco.translate('common.paginator.first');
      this.lastPageLabel = this.transloco.translate('common.paginator.last');
      this.changes.next();
    });
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    const locale = this.transloco.getActiveLang() === 'en' ? 'en-US' : 'es-MX';
    const fmt = (n: number) => n.toLocaleString(locale);
    if (length === 0) return this.transloco.translate('common.paginator.range', { from: 0, to: 0, total: 0 });
    const from = page * pageSize + 1;
    const to = Math.min(length, (page + 1) * pageSize);
    return this.transloco.translate('common.paginator.range', { from: fmt(from), to: fmt(to), total: fmt(length) });
  };
}
