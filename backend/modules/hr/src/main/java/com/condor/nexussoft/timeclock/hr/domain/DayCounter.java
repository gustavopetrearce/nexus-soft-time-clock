package com.condor.nexussoft.timeclock.hr.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;

/** Conteo de días de un periodo (ambos extremos inclusive), compartido por vacaciones y permisos. */
public final class DayCounter {

    private DayCounter() {}

    /** Días naturales o solo hábiles (lun-vie). */
    public static int count(LocalDate start, LocalDate end, boolean businessOnly) {
        int count = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            if (!businessOnly || (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY)) {
                count++;
            }
        }
        return count;
    }
}
