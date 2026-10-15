package com.condor.nexussoft.timeclock.tenancy.domain;

import com.condor.nexussoft.timeclock.shared.domain.DomainException;

import java.util.UUID;

/**
 * Cupo de colaboradores activos contratado por un tenant (RF-29, RN-34).
 *
 * <p>Límite vigente = {@code baseLimit + extraBlocks * blockSize}: 150 de base y bloques de 50,
 * <b>completos y acumulativos</b> (a partir del colaborador 151 hace falta el primero). Los tres
 * valores viajan con el tenant en vez de ser constantes del código, para que un cambio futuro de
 * la oferta comercial no altere retroactivamente los contratos vigentes (S-12).
 */
public class CompanyCapacity {

    public static final int DEFAULT_BASE_LIMIT = 150;
    public static final int DEFAULT_BLOCK_SIZE = 50;

    private final UUID companyId;
    private final int baseLimit;
    private final int blockSize;
    private final int extraBlocks;

    public CompanyCapacity(UUID companyId, int baseLimit, int blockSize, int extraBlocks) {
        if (baseLimit <= 0) {
            throw new DomainException("INVALID_CAPACITY", "El cupo base debe ser mayor que cero");
        }
        if (blockSize <= 0) {
            throw new DomainException("INVALID_CAPACITY", "El tamaño de bloque debe ser mayor que cero");
        }
        if (extraBlocks < 0) {
            throw new DomainException("INVALID_CAPACITY", "Los bloques adicionales no pueden ser negativos");
        }
        this.companyId = companyId;
        this.baseLimit = baseLimit;
        this.blockSize = blockSize;
        this.extraBlocks = extraBlocks;
    }

    /** Cupo de una empresa sin fila propia: el de la oferta estándar, sin bloques. */
    public static CompanyCapacity defaultsFor(UUID companyId) {
        return new CompanyCapacity(companyId, DEFAULT_BASE_LIMIT, DEFAULT_BLOCK_SIZE, 0);
    }

    public int limit() {
        return baseLimit + extraBlocks * blockSize;
    }

    public CompanyCapacity withExtraBlocks(int blocks) {
        return new CompanyCapacity(companyId, baseLimit, blockSize, blocks);
    }

    /**
     * Bloques mínimos para sostener {@code used} colaboradores activos. Sirve para decirle al
     * super admin cuántos bloques necesita en vez de dejarlo probando de uno en uno.
     */
    public int blocksNeededFor(long used) {
        long excess = used - baseLimit;
        if (excess <= 0) {
            return 0;
        }
        return (int) ((excess + blockSize - 1) / blockSize);
    }

    public UUID companyId() {
        return companyId;
    }

    public int baseLimit() {
        return baseLimit;
    }

    public int blockSize() {
        return blockSize;
    }

    public int extraBlocks() {
        return extraBlocks;
    }
}
