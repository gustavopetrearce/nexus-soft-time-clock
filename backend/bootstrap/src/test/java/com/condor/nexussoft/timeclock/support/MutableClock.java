package com.condor.nexussoft.timeclock.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * Reloj de servidor movible a mano, para pruebas que necesitan horas absolutas.
 *
 * <p>La hora oficial del registro es la del servidor (RN-11) y de ella dependen tres cosas a la vez:
 * el {@code server_time} de la marcación, la ventana del turno (RN-15) y la fecha de la incidencia
 * que se abra. Mover {@code server_time} por SQL después de registrar —como hace
 * {@code AttendanceSequenceIT}— solo arregla la primera; para recorrer una jornada con horas reales
 * hay que sustituir el {@link Clock} de producción.</p>
 */
public final class MutableClock extends Clock {

    private volatile Instant instant;

    public MutableClock(Instant initial) {
        this.instant = initial;
    }

    public void set(Instant at) {
        this.instant = at;
    }

    @Override
    public Instant instant() {
        return instant;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;   // la zona no se usa: todo el dominio trabaja con Instant
    }
}
