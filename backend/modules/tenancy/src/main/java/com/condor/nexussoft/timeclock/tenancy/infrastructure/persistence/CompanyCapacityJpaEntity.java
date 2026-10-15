package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicInsert;

import java.util.UUID;

/**
 * Cupo de colaboradores activos del tenant (migración V27).
 *
 * <p>Se mapea como entidad JPA —y no como SQL suelto— para que el interceptor de auditoría
 * registre cada cambio de bloques con sus valores antes/después (RN-43, CA8 de HU-27).
 *
 * <p>{@code @DynamicInsert} con inicializadores iguales a los defaults del esquema: el alta de una
 * empresa inserta solo la clave y la BD pone 150/50/0.
 */
@Entity
@Table(name = "company_capacity")
@DynamicInsert
public class CompanyCapacityJpaEntity {

    @Id
    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "base_limit")
    private int baseLimit = 150;

    @Column(name = "block_size")
    private int blockSize = 50;

    @Column(name = "extra_blocks")
    private int extraBlocks = 0;

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected CompanyCapacityJpaEntity() {
    }

    public CompanyCapacityJpaEntity(UUID companyId) {
        this.companyId = companyId;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public int getBaseLimit() {
        return baseLimit;
    }

    public int getBlockSize() {
        return blockSize;
    }

    public int getExtraBlocks() {
        return extraBlocks;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public void setBaseLimit(int v) {
        this.baseLimit = v;
    }

    public void setBlockSize(int v) {
        this.blockSize = v;
    }

    public void setExtraBlocks(int v) {
        this.extraBlocks = v;
    }

    public void setUpdatedBy(UUID v) {
        this.updatedBy = v;
    }
}
