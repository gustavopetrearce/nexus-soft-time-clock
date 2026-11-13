package com.condor.nexussoft.timeclock.reporting.infrastructure.export;

import com.condor.nexussoft.timeclock.reporting.application.ReportRow;

/** Definición común de columnas del reporte de asistencia (reutilizada por los 3 formatos, DRY). */
final class ReportColumns {

    static final String[] HEADERS = {
            "Fecha (servidor)", "Usuario", "Evento", "Estado", "Motivo rechazo", "Latitud", "Longitud", "Causa cancelación"
    };

    private ReportColumns() {
    }

    static String[] toCells(ReportRow r) {
        return new String[]{
                r.serverTime().toString(),
                String.valueOf(r.userId()),
                r.eventType(),
                r.status(),
                r.rejectionReason() == null ? "" : r.rejectionReason(),
                r.latitude() == null ? "" : String.valueOf(r.latitude()),
                r.longitude() == null ? "" : String.valueOf(r.longitude()),
                r.cancelReason() == null ? "" : r.cancelReason()
        };
    }
}
