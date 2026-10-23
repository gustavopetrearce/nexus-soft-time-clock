import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppLang, LanguageService } from './language.service';

/** Cada idioma se ofrece en su propia lengua, así se reconoce aunque no se entienda la actual. */
const OPTIONS: readonly { lang: AppLang; label: string }[] = [
  { lang: 'es', label: 'Español' },
  { lang: 'en', label: 'English' },
];

/** Botón con menú para cambiar el idioma de la interfaz (toolbar y pantalla de login). */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslocoPipe],
  template: `
    <button
      mat-icon-button
      [matMenuTriggerFor]="langMenu"
      [attr.aria-label]="'language.change' | transloco"
      [matTooltip]="'language.change' | transloco"
    >
      <mat-icon>translate</mat-icon>
    </button>
    <mat-menu #langMenu="matMenu">
      @for (o of options; track o.lang) {
        <button mat-menu-item (click)="language.set(o.lang)" [attr.aria-current]="o.lang === language.lang()">
          <mat-icon>{{ o.lang === language.lang() ? 'check' : '' }}</mat-icon>
          <span [attr.lang]="o.lang">{{ o.label }}</span>
        </button>
      }
    </mat-menu>
  `,
})
export class LanguageSwitcherComponent {
  protected readonly language = inject(LanguageService);
  protected readonly options = OPTIONS;
}
