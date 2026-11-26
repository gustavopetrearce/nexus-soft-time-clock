package com.condor.nexussoft.timeclock.onboarding.domain;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TemporaryPasswordGeneratorTest {

    @Test
    void generaContrasenasLargasMixtasYDistintas() {
        TemporaryPasswordGenerator generator = new TemporaryPasswordGenerator();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String p = generator.generate();
            assertThat(p).hasSize(TemporaryPasswordGenerator.LENGTH)
                    .containsPattern("[A-Z]").containsPattern("[a-z]").containsPattern("[2-9]")
                    .doesNotContainPattern("[0O1lI]");
            seen.add(p);
        }
        assertThat(seen).hasSize(200);
    }
}
