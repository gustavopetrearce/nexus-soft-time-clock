package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import java.time.Instant;
import java.util.UUID;

/**
 * Contrato del colaborador (V33, módulo HR) visto desde la marcación: a qué proyecto se atribuye la
 * marca (RN-67) y si cae fuera de la vigencia de un contrato por proyecto (RN-66).
 *
 * <p>La fecha se mide en la zona del centro (o de la empresa, o UTC) del momento evaluado. Nunca
 * lanza: un fallo de lectura no puede tumbar ni marcar rollback-only la transacción del registro.</p>
 */
public interface ContractPolicyPort {

    enum Outcome {
        /** Sin contrato por proyecto aplicable (sin contratos, o uno por turno): no hay nada que señalar. */
        NO_PROJECT_CONTRACT,
        /** Contrato por proyecto vigente en la fecha, con el proyecto activo y dentro de su vigencia. */
        WITHIN_VALIDITY,
        /** Contrato por proyecto, pero la fecha cae fuera del contrato o del proyecto, o el proyecto no está activo. */
        OUT_OF_VALIDITY
    }

    /** @param projectId proyecto al que se atribuye la marca; nulo con {@link Outcome#NO_PROJECT_CONTRACT}. */
    record ContractDecision(Outcome outcome, UUID projectId) {

        public static ContractDecision none() {
            return new ContractDecision(Outcome.NO_PROJECT_CONTRACT, null);
        }

        public boolean outOfValidity() {
            return outcome == Outcome.OUT_OF_VALIDITY;
        }
    }

    ContractDecision check(UUID tenantId, UUID userId, UUID workSiteId, Instant at);
}
