// sockjs-client (usado por el cliente STOMP del mapa en tiempo real) referencia `global`,
// ausente en el navegador; se apunta a globalThis antes de arrancar la app.
(globalThis as unknown as { global: typeof globalThis }).global ??= globalThis;

import { registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Datos de formato (meses, separadores) de los idiomas de la interfaz, usados por el pipe appDate.
registerLocaleData(localeEs);
registerLocaleData(localeEn);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
