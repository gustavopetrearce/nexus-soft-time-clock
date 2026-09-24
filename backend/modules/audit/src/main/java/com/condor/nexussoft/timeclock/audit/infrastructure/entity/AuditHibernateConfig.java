package com.condor.nexussoft.timeclock.audit.infrastructure.entity;

import com.condor.nexussoft.timeclock.audit.application.AuditRecorder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.cfg.AvailableSettings;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Instala {@link EntityChangeAuditInterceptor} en la sesión de Hibernate. Al ser un interceptor
 * de la {@code SessionFactory} lo comparten todos los hilos, por eso el interceptor acumula su
 * estado en variables de hilo.
 */
@Configuration
public class AuditHibernateConfig {

    @Bean
    public EntityChangeAuditInterceptor entityChangeAuditInterceptor(
            ObjectProvider<AuditRecorder> recorder, ObjectMapper objectMapper) {
        return new EntityChangeAuditInterceptor(recorder, objectMapper);
    }

    @Bean
    public HibernatePropertiesCustomizer auditInterceptorCustomizer(
            EntityChangeAuditInterceptor interceptor) {
        return properties -> properties.put(AvailableSettings.INTERCEPTOR, interceptor);
    }
}
