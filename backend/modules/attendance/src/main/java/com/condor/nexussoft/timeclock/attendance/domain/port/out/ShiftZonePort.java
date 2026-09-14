package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import java.time.ZoneId;
import java.util.UUID;

/**
 * Zona en la que se interpretan las horas de pared de un turno ({@code shifts.start_time} y
 * {@code end_time} son {@code time} sin huso). Resuelve la herencia que documenta
 * {@code V4__scheduling.sql}: <b>horario → centro → empresa → UTC</b>.
 *
 * <p>Sin esta cadena, un horario sin zona evaluaba la ventana en UTC contra unas horas que el
 * administrador escribió en hora local: para una empresa a UTC−6 eso desplaza la comparación seis
 * horas y convierte una entrada puntual en un retardo de dos horas contra el turno equivocado.</p>
 */
public interface ShiftZonePort {

    /** Zona del turno. Nunca devuelve {@code null}: a falta de todo lo demás, UTC. */
    ZoneId resolve(UUID tenantId, UUID scheduleId, UUID workSiteId);
}
