package com.borgwarner.testatlas.algorithm;

import java.util.Set;

/**
 * Catalogue metadata of an executable algorithm. Kept from the Engineering
 * Toolbox contract so the Test Atlas strategy is unchanged; only the values
 * used by Test Atlas remain.
 */
public record AlgorithmMetadata(
        Set<Platform> platforms,
        Set<Role> roles,
        Set<Tag> tags) {

    public static final AlgorithmMetadata EMPTY = new AlgorithmMetadata(Set.of(), Set.of(), Set.of());

    public AlgorithmMetadata {
        platforms = platforms == null ? Set.of() : Set.copyOf(platforms);
        roles = roles == null ? Set.of() : Set.copyOf(roles);
        tags = tags == null ? Set.of() : Set.copyOf(tags);
    }

    public enum Platform {
        FILE_REPOSITORY
    }

    public enum Role {
        ANYONE
    }

    public enum Tag {
        TEST_MANAGEMENT
    }
}
