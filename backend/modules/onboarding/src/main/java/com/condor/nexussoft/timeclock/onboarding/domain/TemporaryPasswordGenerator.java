package com.condor.nexussoft.timeclock.onboarding.domain;

import java.security.SecureRandom;

/**
 * Contraseña temporal de un colaborador importado: 14 caracteres de un alfabeto sin caracteres
 * ambiguos (sin 0/O ni 1/l/I) para que se pueda dictar o copiar a mano. Siempre lleva mayúscula,
 * minúscula y dígito, y cumple de sobra la política actual (≥ 8, ver CreateUserRequest).
 */
public final class TemporaryPasswordGenerator {

    static final int LENGTH = 14;
    private static final String UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijkmnopqrstuvwxyz";
    private static final String DIGITS = "23456789";
    private static final String ALL = UPPER + LOWER + DIGITS;

    private final SecureRandom random;

    public TemporaryPasswordGenerator() {
        this(new SecureRandom());
    }

    TemporaryPasswordGenerator(SecureRandom random) {
        this.random = random;
    }

    public String generate() {
        char[] out = new char[LENGTH];
        out[0] = pick(UPPER);
        out[1] = pick(LOWER);
        out[2] = pick(DIGITS);
        for (int i = 3; i < LENGTH; i++) {
            out[i] = pick(ALL);
        }
        // Baraja para que la mayúscula, la minúscula y el dígito obligatorios no queden siempre al inicio.
        for (int i = LENGTH - 1; i > 0; i--) {
            int j = random.nextInt(i + 1);
            char t = out[i];
            out[i] = out[j];
            out[j] = t;
        }
        return new String(out);
    }

    private char pick(String alphabet) {
        return alphabet.charAt(random.nextInt(alphabet.length()));
    }
}
