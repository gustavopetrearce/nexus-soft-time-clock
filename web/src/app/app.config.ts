import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { APP_LANGS, DEFAULT_LANG, LanguageService } from './core/i18n/language.service';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { TranslocoPaginatorIntl } from './core/i18n/paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTransloco({
      config: {
        availableLangs: [...APP_LANGS],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    // Íconos Material Icons Outlined por defecto (DS/04); el relleno queda para estados activos.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-icons-outlined' } },
    { provide: MatPaginatorIntl, useClass: TranslocoPaginatorIntl },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (language: LanguageService) => () => language.init(),
      deps: [LanguageService],
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
