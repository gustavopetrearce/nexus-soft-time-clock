import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Barra de desplazamiento oculta hasta que se desplaza (DS/09, reglas comunes): marca el host con
 * `is-scrolling` mientras se desplaza y la quita `motion-delay-hide` después de detenerse.
 */
@Directive({
  selector: '[nxScroll]',
  standalone: true,
})
export class ScrollDirective implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onScroll = (): void => {
    this.host.classList.add('is-scrolling');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.host.classList.remove('is-scrolling'), hideDelayMs());
  };

  ngOnInit(): void {
    // Fuera de la zona: desplazarse no debe disparar detección de cambios.
    this.zone.runOutsideAngular(() => this.host.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('scroll', this.onScroll);
    clearTimeout(this.timer);
  }
}

function hideDelayMs(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nx-motion-delay-hide')) || 0;
}
