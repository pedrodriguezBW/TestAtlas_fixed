package com.borgwarner.testatlas.lifecycle;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.annotation.PreDestroy;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Service;

@Service
public class BrowserLifecycleService {

    private static final Duration CLOSE_GRACE_PERIOD = Duration.ofSeconds(8);

    private final ConfigurableApplicationContext applicationContext;
    private final ScheduledExecutorService supervisor;
    private final AtomicReference<String> activeSession = new AtomicReference<>();
    private final AtomicReference<Instant> closeRequestedAt = new AtomicReference<>();
    private final AtomicBoolean shutdownStarted = new AtomicBoolean(false);

    public BrowserLifecycleService(
            ConfigurableApplicationContext applicationContext) {

        this.applicationContext = applicationContext;

        this.supervisor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(
                    runnable,
                    "testatlas-browser-supervisor"
            );

            thread.setDaemon(true);
            return thread;
        });

        this.supervisor.scheduleWithFixedDelay(
                this::supervise,
                1,
                1,
                TimeUnit.SECONDS
        );
    }

    public void heartbeat(String sessionId) {
        String normalized = normalize(sessionId);

        if (normalized == null) {
            return;
        }

        activeSession.set(normalized);
        closeRequestedAt.set(null);
    }

    public void requestClose(String sessionId) {
        String normalized = normalize(sessionId);
        String currentSession = activeSession.get();

        if (normalized == null || currentSession == null) {
            return;
        }

        if (currentSession.equals(normalized)) {
            closeRequestedAt.set(Instant.now());
        }
    }

    private void supervise() {
        try {
            Instant requestedAt = closeRequestedAt.get();

            if (requestedAt == null || shutdownStarted.get()) {
                return;
            }

            Duration elapsed = Duration.between(
                    requestedAt,
                    Instant.now()
            );

            if (elapsed.compareTo(CLOSE_GRACE_PERIOD) >= 0) {
                shutdown();
            }
        }
        catch (Exception ignored) {
            // El supervisor no debe detenerse por un fallo puntual.
        }
    }

    private void shutdown() {
        if (!shutdownStarted.compareAndSet(false, true)) {
            return;
        }

        Thread shutdownThread = new Thread(() -> {
            int exitCode = SpringApplication.exit(
                    applicationContext,
                    () -> 0
            );

            System.exit(exitCode);
        }, "testatlas-browser-shutdown");

        shutdownThread.setDaemon(false);
        shutdownThread.start();
    }

    private static String normalize(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }

        return sessionId.trim();
    }

    @PreDestroy
    public void stopSupervisor() {
        supervisor.shutdownNow();
    }
}