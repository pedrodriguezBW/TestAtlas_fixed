package com.borgwarner.testatlas.service;

import com.borgwarner.testatlas.algorithm.Registry_AlgorithmStrategy;
import com.borgwarner.testatlas.algorithm.interfaces.I_AlgorithmInputs;
import com.borgwarner.testatlas.algorithm.interfaces.I_ExecutableAlgorithm;
import com.borgwarner.testatlas.algorithm.interfaces.I_OutputData;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs a registered algorithm (in the standalone project only {@code TEST_ATLAS})
 * with the same flow as the Engineering Toolbox: look up the strategy, convert the
 * JSON configuration to its record, execute it with progress and deliver the
 * result. The Toolbox persisted every execution in its PostgreSQL statistics
 * tables; Test Atlas standalone has no database, so the outcome and the
 * strategy summary are written to the application log instead.
 */
@Service
public class AlgorithmService {

    private static final Logger LOG = LoggerFactory.getLogger(AlgorithmService.class);

    private final Registry_AlgorithmStrategy registry;
    private final ObjectMapper mapper;

    public AlgorithmService(Registry_AlgorithmStrategy registry, ObjectMapper mapper) {
        this.registry = registry;
        this.mapper = mapper;
    }

    public Set<String> listAlgorithmKeys() {
        return registry.getRegisteredKeys();
    }

    public Map<String, String> listAlgorithmVersions() {
        return registry.getRegisteredVersions();
    }

    public I_OutputData run(String key, JsonNode rawConfig, I_ProgressListener progress) {
        return run(key, rawConfig, progress, result -> {});
    }

    /**
     * Runs the selected algorithm and hands the result to {@code resultDelivery}.
     * Exceptions are logged and rethrown so the NDJSON contract of
     * {@code AlgorithmController} is unchanged.
     */
    public I_OutputData run(String key, JsonNode rawConfig, I_ProgressListener progress,
            Consumer<I_OutputData> resultDelivery) {
        long startNanos = System.nanoTime();
        try {
            Class<? extends I_AlgorithmInputs> configClass = registry.getConfigClass(key);
            I_AlgorithmInputs config = mapper.convertValue(rawConfig, configClass);
            I_OutputData result = registry.executeAlgorithm(key, config, progress);
            List<String> issues = result.executionIssues();
            resultDelivery.accept(result);
            LOG.info("{} {} in {} ms: {}{}", key, issues.isEmpty() ? "COMPLETED" : "FAILED", elapsedMs(startNanos),
                    summarize(key, result), issues.isEmpty() ? "" : " (" + String.join("; ", issues) + ")");
            return result;
        } catch (RuntimeException e) {
            LOG.warn("{} FAILED in {} ms: {}", key, elapsedMs(startNanos),
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            throw e;
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private String summarize(String key, I_OutputData result) {
        try {
            I_ExecutableAlgorithm algorithm = registry.getStrategy(key);
            return algorithm.summarize(result);
        } catch (Exception e) {
            return "";
        }
    }

    private long elapsedMs(long startNanos) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNanos);
    }
}
