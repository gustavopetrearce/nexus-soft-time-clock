package com.condor.nexussoft.timeclock.identity.domain.model;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CollaboratorCapacityPolicyTest {

    @Test
    void consumenCupo_todosLosEstadosSalvoLaBaja() {
        assertThat(CollaboratorCapacityPolicy.consumesCapacity("ACTIVE")).isTrue();
        assertThat(CollaboratorCapacityPolicy.consumesCapacity("INVITED")).isTrue();
        assertThat(CollaboratorCapacityPolicy.consumesCapacity("LOCKED")).isTrue();
        assertThat(CollaboratorCapacityPolicy.consumesCapacity("INACTIVE")).isFalse();
        assertThat(CollaboratorCapacityPolicy.consumesCapacity(null)).isFalse();
    }

    @Test
    void alta_deColaborador_necesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot(null, false, "ACTIVE", true)).isTrue();
    }

    @Test
    void alta_deCuentaDePortal_noNecesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot(null, false, "ACTIVE", false)).isFalse();
    }

    @Test
    void reactivacion_trasBaja_necesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot("INACTIVE", true, "ACTIVE", true)).isTrue();
    }

    @Test
    void desbloqueo_noNecesitaSitioPorqueElBloqueoNoLiberaba() {
        assertThat(CollaboratorCapacityPolicy.needsSlot("LOCKED", true, "ACTIVE", true)).isFalse();
    }

    @Test
    void baja_noNecesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot("ACTIVE", true, "INACTIVE", true)).isFalse();
    }

    @Test
    void cambioDeRol_queHabilitaElRegistro_necesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot("ACTIVE", false, "ACTIVE", true)).isTrue();
    }

    @Test
    void cambioDeRol_queRetiraElRegistro_noNecesitaSitio() {
        assertThat(CollaboratorCapacityPolicy.needsSlot("ACTIVE", true, "ACTIVE", false)).isFalse();
    }

    @Test
    void revocacionDeSesiones_entodoEstadoQueNoSeaActivo() {
        assertThat(CollaboratorCapacityPolicy.mustRevokeSessions("INACTIVE")).isTrue();
        assertThat(CollaboratorCapacityPolicy.mustRevokeSessions("LOCKED")).isTrue();
        assertThat(CollaboratorCapacityPolicy.mustRevokeSessions("INVITED")).isTrue();
        assertThat(CollaboratorCapacityPolicy.mustRevokeSessions("ACTIVE")).isFalse();
    }
}
