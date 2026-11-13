package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecordRef;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceStatus;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceCancelled;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.CancelAttendanceUseCase.CancelledAttendance;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.AttendanceEventPublisherPort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.AttendanceRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CancelAttendanceServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-13T15:00:00Z");
    private static final Instant MARK_TIME = Instant.parse("2026-11-13T13:05:00Z");

    @Mock
    private AttendanceRepositoryPort records;
    @Mock
    private AttendanceEventPublisherPort events;

    private CancelAttendanceService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID recordId = UUID.randomUUID();
    private final UUID employee = UUID.randomUUID();
    private final UUID supervisor = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new CancelAttendanceService(records, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private AttendanceRecordRef mark(AttendanceStatus status) {
        return new AttendanceRecordRef(recordId, tenant, MARK_TIME, employee, AttendanceEventType.ENTRADA, status);
    }

    @ParameterizedTest
    @EnumSource(value = AttendanceStatus.class, names = {"ACCEPTED", "PENDING_REVIEW"})
    void cancela_marcaQueCuenta_yPublicaElEvento(AttendanceStatus status) {
        when(records.findRef(tenant, recordId, MARK_TIME)).thenReturn(Optional.of(mark(status)));
        when(records.markCancelled(tenant, recordId, MARK_TIME, "Emergencia", supervisor, NOW)).thenReturn(true);

        CancelledAttendance result = service.cancel(tenant, recordId, MARK_TIME, "  Emergencia ", supervisor);

        assertThat(result.status()).isEqualTo("CANCELLED");
        assertThat(result.cancelReason()).isEqualTo("Emergencia");
        assertThat(result.cancelledAt()).isEqualTo(NOW);
        ArgumentCaptor<AttendanceCancelled> event = ArgumentCaptor.forClass(AttendanceCancelled.class);
        verify(events).publish(event.capture());
        assertThat(event.getValue().attendanceId()).isEqualTo(recordId);
        assertThat(event.getValue().userId()).isEqualTo(employee);
        assertThat(event.getValue().cancelledBy()).isEqualTo(supervisor);
        assertThat(event.getValue().reason()).isEqualTo("Emergencia");
        assertThat(event.getValue().eventKind()).isEqualTo("ENTRADA");
    }

    @Test
    void sinServerTime_buscaSoloPorId_yUsaElDeLaMarca() {
        when(records.findRef(tenant, recordId, null)).thenReturn(Optional.of(mark(AttendanceStatus.ACCEPTED)));
        when(records.markCancelled(tenant, recordId, MARK_TIME, "Permiso", supervisor, NOW)).thenReturn(true);

        CancelledAttendance result = service.cancel(tenant, recordId, null, "Permiso", supervisor);

        assertThat(result.serverTime()).isEqualTo(MARK_TIME);
    }

    @Test
    void causaVacia_seRechaza() {
        assertThatThrownBy(() -> service.cancel(tenant, recordId, MARK_TIME, "   ", supervisor))
                .isInstanceOf(DomainException.class)
                .extracting("code").isEqualTo("CANCEL_REASON_REQUIRED");
        verifyNoInteractions(records, events);
    }

    @Test
    void causaDemasiadoLarga_seRechaza() {
        assertThatThrownBy(() -> service.cancel(tenant, recordId, MARK_TIME, "x".repeat(501), supervisor))
                .isInstanceOf(DomainException.class)
                .extracting("code").isEqualTo("CANCEL_REASON_TOO_LONG");
    }

    @Test
    void marcaInexistenteEnElTenant_da404() {
        when(records.findRef(tenant, recordId, MARK_TIME)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.cancel(tenant, recordId, MARK_TIME, "Permiso", supervisor))
                .isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(events);
    }

    @ParameterizedTest
    @EnumSource(value = AttendanceStatus.class, names = {"REJECTED", "CANCELLED"})
    void marcaQueNoCuenta_noSeCancela(AttendanceStatus status) {
        when(records.findRef(tenant, recordId, MARK_TIME)).thenReturn(Optional.of(mark(status)));

        assertThatThrownBy(() -> service.cancel(tenant, recordId, MARK_TIME, "Permiso", supervisor))
                .isInstanceOf(ConflictException.class);
        verify(records, never()).markCancelled(any(), any(), any(), any(), any(), any());
        verifyNoInteractions(events);
    }

    @Test
    void canceladaEnParalelo_daConflictoSinEvento() {
        when(records.findRef(tenant, recordId, MARK_TIME)).thenReturn(Optional.of(mark(AttendanceStatus.ACCEPTED)));
        when(records.markCancelled(tenant, recordId, MARK_TIME, "Permiso", supervisor, NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.cancel(tenant, recordId, MARK_TIME, "Permiso", supervisor))
                .isInstanceOf(ConflictException.class)
                .extracting("code").isEqualTo("ATTENDANCE_ALREADY_CANCELLED");
        verifyNoInteractions(events);
    }
}
