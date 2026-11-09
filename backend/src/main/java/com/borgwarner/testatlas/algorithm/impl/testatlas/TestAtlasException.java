package com.borgwarner.testatlas.algorithm.impl.testatlas;

/**
 * Validation or repository-state failure raised while planning or saving a
 * Test Atlas request. Mirrors the {@code fail(message, status)} helper of the
 * original Test Atlas server: the message is user-facing and {@link #status()}
 * is the HTTP status the auxiliary endpoints answer with (400 by default, 404
 * for missing resources and 409 when the repository changed after the review).
 *
 * <p>Extends {@link IllegalArgumentException} so the generic algorithm pipeline
 * treats it like any other configuration failure.
 */
public class TestAtlasException extends IllegalArgumentException {

    private final int status;

    public TestAtlasException(String message) {
        this(message, 400);
    }

    public TestAtlasException(String message, int status) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
