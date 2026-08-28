package com.condor.nexussoft.timeclock.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Base de las pruebas de integración que necesitan el esquema real: PostGIS —no Postgres a secas,
 * porque las migraciones usan {@code geography(Point,4326)}— con las migraciones de Flyway aplicadas
 * al levantar el contexto.
 *
 * <p>El contenedor se arranca una sola vez por JVM (patrón <i>singleton container</i>) en vez de con
 * {@code @Container}, que lo ata al ciclo de vida de cada clase: así añadir un IT más no cuesta otro
 * contenedor. Lo para la JVM al terminar, con Ryuk de red de seguridad.</p>
 *
 * <p><b>Escape para desarrollo local:</b> con {@code -Dit.datasource.url=...} las pruebas se conectan
 * a un PostGIS ya levantado y no se toca Docker. Existe porque Testcontainers no negocia la versión
 * de API con Docker Desktop 29 en Windows —la estrategia de <i>named pipe</i> recibe un 400— y sin
 * esta salida estos ITs solo se pueden ejecutar en CI. Apuntar siempre a una base desechable: las
 * pruebas escriben en ella.</p>
 */
@SpringBootTest(properties = {
        "spring.cache.type=none",
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.data.redis.RedisReactiveAutoConfiguration",
        "outbox.relay-delay-ms=60000",
        "storage.minio.enabled=false"
})
public abstract class PostgisIntegrationTest {

    private static final String EXTERNAL_URL = System.getProperty("it.datasource.url");

    private static final PostgreSQLContainer<?> POSTGIS;

    static {
        if (EXTERNAL_URL == null) {
            POSTGIS = new PostgreSQLContainer<>(
                    DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("nexus")
                    .withUsername("nexus")
                    .withPassword("nexus");
            POSTGIS.start();
        } else {
            POSTGIS = null;
        }
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> EXTERNAL_URL != null ? EXTERNAL_URL : POSTGIS.getJdbcUrl());
        registry.add("spring.datasource.username",
                () -> EXTERNAL_URL != null ? System.getProperty("it.datasource.username") : POSTGIS.getUsername());
        registry.add("spring.datasource.password",
                () -> EXTERNAL_URL != null ? System.getProperty("it.datasource.password") : POSTGIS.getPassword());
    }
}
