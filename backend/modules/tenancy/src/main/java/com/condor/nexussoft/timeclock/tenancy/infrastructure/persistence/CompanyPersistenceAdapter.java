package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import com.condor.nexussoft.timeclock.shared.domain.Paged;
import com.condor.nexussoft.timeclock.tenancy.domain.Company;
import com.condor.nexussoft.timeclock.tenancy.domain.CompanyStatus;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyRepositoryPort;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class CompanyPersistenceAdapter implements CompanyRepositoryPort {

    private final CompanyJpaRepository companies;
    private final CompanySettingsJpaRepository settings;
    private final CompanyCapacityJpaRepository capacities;

    public CompanyPersistenceAdapter(CompanyJpaRepository companies, CompanySettingsJpaRepository settings,
                                     CompanyCapacityJpaRepository capacities) {
        this.companies = companies;
        this.settings = settings;
        this.capacities = capacities;
    }

    @Override
    public Company save(Company company) {
        companies.save(toEntity(company));
        settings.save(new CompanySettingsJpaEntity(company.id()));  // configuración por defecto
        // Cupo contratado por defecto (150 + 0 bloques, RF-29). Sin esta fila el tenant seguiría
        // operando con los mismos valores, pero el cupo no tendría dónde bloquearse (RN-37).
        capacities.save(new CompanyCapacityJpaEntity(company.id()));
        return company;
    }

    @Override
    public Company update(Company company) {
        CompanyJpaEntity entity = companies.findById(company.id()).orElseThrow();
        entity.setName(company.name());
        entity.setLegalName(company.legalName());
        entity.setEmailDomain(company.emailDomain());
        entity.setTimezone(company.timezone());
        entity.setLocale(company.locale());
        entity.setStatus(company.status().name());
        companies.save(entity);
        return company;
    }

    @Override
    public Optional<Company> findById(UUID id) {
        return companies.findById(id).map(this::toDomain);
    }

    @Override
    public boolean existsByCode(String code) {
        return companies.existsByCodeIgnoreCase(code);
    }

    @Override
    public Paged<Company> findAll(int page, int size, String search) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("name").ascending());
        Page<CompanyJpaEntity> result = (search == null || search.isBlank())
                ? companies.findAll(pageable)
                : companies.findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(search, search, pageable);
        return new Paged<>(result.map(this::toDomain).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements());
    }

    private CompanyJpaEntity toEntity(Company c) {
        return new CompanyJpaEntity(c.id(), c.code(), c.name(), c.legalName(),
                c.emailDomain(), c.timezone(), c.locale(), c.status().name());
    }

    private Company toDomain(CompanyJpaEntity e) {
        return new Company(e.getId(), e.getCode(), e.getName(), e.getLegalName(),
                e.getEmailDomain(), e.getTimezone(), e.getLocale(), CompanyStatus.valueOf(e.getStatus()));
    }
}
