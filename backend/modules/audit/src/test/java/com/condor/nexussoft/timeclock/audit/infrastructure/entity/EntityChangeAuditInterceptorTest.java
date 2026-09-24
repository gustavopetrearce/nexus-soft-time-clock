package com.condor.nexussoft.timeclock.audit.infrastructure.entity;

import com.condor.nexussoft.timeclock.audit.application.AuditRecorder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RN-43 exige auditar el 100 % de las escrituras y RN-60, con sus valores anteriores y nuevos.
 * Antes solo se registraba lo que pasaba por un evento de dominio —asistencia y login—, así que
 * el alta de un usuario o el cambio de una geocerca no dejaban rastro.
 */
class EntityChangeAuditInterceptorTest {

    private static final String[] PROPIEDADES = {"tenantId", "name", "radiusM", "passwordHash"};

    private AuditRecorder recorder;
    private EntityChangeAuditInterceptor interceptor;

    @BeforeEach
    void setUp() {
        recorder = mock(AuditRecorder.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<AuditRecorder> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(recorder);
        interceptor = new EntityChangeAuditInterceptor(provider, new ObjectMapper());
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    @DisplayName("el alta de una entidad de negocio se audita como CREATE con sus valores")
    void altaAuditada() {
        UUID tenant = UUID.randomUUID();

        interceptor.onSave(new WorkSiteJpaEntity(), "sede-1",
                new Object[]{tenant, "Planta Norte", 150, "no-aplica"}, PROPIEDADES, null);
        commit();

        ArgumentCaptor<String> nuevos = ArgumentCaptor.forClass(String.class);
        verify(recorder).record(eq(tenant), eq("CREATE_WORK_SITE"), eq("WORK_SITE"), eq("sede-1"),
                eq(null), nuevos.capture());
        assertThat(nuevos.getValue()).contains("Planta Norte").contains("150");
    }

    @Test
    @DisplayName("la modificación guarda solo lo que cambió, con su valor anterior")
    void modificacionAuditada() {
        UUID tenant = UUID.randomUUID();
        Object[] antes = {tenant, "Planta Norte", 150, "hash-viejo"};
        Object[] despues = {tenant, "Planta Norte", 250, "hash-viejo"};

        interceptor.onFlushDirty(new WorkSiteJpaEntity(), "sede-1", despues, antes, PROPIEDADES, null);
        commit();

        ArgumentCaptor<String> viejos = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> nuevos = ArgumentCaptor.forClass(String.class);
        verify(recorder).record(eq(tenant), eq("UPDATE_WORK_SITE"), eq("WORK_SITE"), eq("sede-1"),
                viejos.capture(), nuevos.capture());
        assertThat(viejos.getValue()).contains("150").doesNotContain("Planta Norte");
        assertThat(nuevos.getValue()).contains("250");
    }

    @Test
    @DisplayName("un flush sin cambio efectivo no ensucia la bitácora")
    void flushSinCambios() {
        Object[] estado = {UUID.randomUUID(), "Planta Norte", 150, "hash"};

        interceptor.onFlushDirty(new WorkSiteJpaEntity(), "sede-1", estado, estado.clone(), PROPIEDADES, null);
        commit();

        verify(recorder, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("mover solo el «visto por última vez» no es una acción que auditar")
    void soloMarcasDeRastro() {
        String[] propiedades = {"tenantId", "lastSeenAt", "createdAt"};
        UUID tenant = UUID.randomUUID();
        Object[] antes = {tenant, "2026-09-22T10:00:00Z", "2026-09-01T08:00:00Z"};
        Object[] despues = {tenant, "2026-09-22T18:30:00Z", null};

        interceptor.onFlushDirty(new DeviceJpaEntity(), "d-1", despues, antes, propiedades, null);
        commit();

        verify(recorder, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("pero aprobar el dispositivo sí, aunque de paso mueva esas marcas")
    void cambioRealJuntoAMarcasDeRastro() {
        String[] propiedades = {"tenantId", "trusted", "lastSeenAt"};
        UUID tenant = UUID.randomUUID();
        Object[] antes = {tenant, false, "2026-09-22T10:00:00Z"};
        Object[] despues = {tenant, true, "2026-09-22T18:30:00Z"};

        interceptor.onFlushDirty(new DeviceJpaEntity(), "d-1", despues, antes, propiedades, null);
        commit();

        ArgumentCaptor<String> nuevos = ArgumentCaptor.forClass(String.class);
        verify(recorder).record(eq(tenant), eq("UPDATE_DEVICE"), eq("DEVICE"), eq("d-1"),
                any(), nuevos.capture());
        assertThat(nuevos.getValue()).contains("trusted");
    }

    @Test
    @DisplayName("la contraseña se registra como cambiada, nunca su valor")
    void secretosEnmascarados() {
        UUID tenant = UUID.randomUUID();
        Object[] antes = {tenant, "Ana", 1, "$2a$10$viejo"};
        Object[] despues = {tenant, "Ana", 1, "$2a$10$nuevo"};

        interceptor.onFlushDirty(new UserJpaEntity(), "u-1", despues, antes, PROPIEDADES, null);
        commit();

        ArgumentCaptor<String> viejos = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> nuevos = ArgumentCaptor.forClass(String.class);
        verify(recorder).record(eq(tenant), eq("UPDATE_USER"), eq("USER"), eq("u-1"),
                viejos.capture(), nuevos.capture());
        assertThat(viejos.getValue()).contains("passwordHash").doesNotContain("viejo");
        assertThat(nuevos.getValue()).contains("***").doesNotContain("nuevo");
    }

    @Test
    @DisplayName("la propia bitácora no se audita: sería un bucle")
    void bitacoraExcluida() {
        interceptor.onSave(new AuditLogJpaEntity(), "a-1",
                new Object[]{UUID.randomUUID(), "x", 1, "y"}, PROPIEDADES, null);
        commit();

        verify(recorder, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("las marcaciones no se duplican: ya las audita su evento de dominio")
    void asistenciaExcluida() {
        interceptor.onSave(new AttendanceRecordJpaEntity(), "r-1",
                new Object[]{UUID.randomUUID(), "x", 1, "y"}, PROPIEDADES, null);
        commit();

        verify(recorder, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("la baja conserva lo que había antes de borrarse")
    void bajaAuditada() {
        UUID tenant = UUID.randomUUID();

        interceptor.onDelete(new ProjectJpaEntity(), "p-1",
                new Object[]{tenant, "Obra Sur", 10, "x"}, PROPIEDADES, null);
        commit();

        ArgumentCaptor<String> viejos = ArgumentCaptor.forClass(String.class);
        verify(recorder).record(eq(tenant), eq("DELETE_PROJECT"), eq("PROJECT"), eq("p-1"),
                viejos.capture(), eq(null));
        assertThat(viejos.getValue()).contains("Obra Sur");
    }

    @Test
    @DisplayName("sin transacción activa no se audita en vez de reventar la escritura")
    void sinTransaccion() {
        TransactionSynchronizationManager.clearSynchronization();

        interceptor.onSave(new WorkSiteJpaEntity(), "sede-1",
                new Object[]{UUID.randomUUID(), "x", 1, "y"}, PROPIEDADES, null);

        verify(recorder, never()).record(any(), any(), any(), any(), any(), any());
        TransactionSynchronizationManager.initSynchronization();  // el tearDown espera sincronización
    }

    private void commit() {
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.beforeCommit(false));
    }

    // Dobles con el nombre de las entidades reales: el interceptor decide por él.
    private static final class WorkSiteJpaEntity { }

    private static final class UserJpaEntity { }

    private static final class ProjectJpaEntity { }

    private static final class AuditLogJpaEntity { }

    private static final class AttendanceRecordJpaEntity { }

    private static final class DeviceJpaEntity { }
}
