/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.borgwarner.testatlas.algorithm;

import com.borgwarner.testatlas.algorithm.interfaces.I_OutputData;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import com.borgwarner.testatlas.algorithm.interfaces.I_ExecutableAlgorithm;
import com.borgwarner.testatlas.algorithm.interfaces.I_AlgorithmInputs;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 *
 * @author adperez
 */
@Component
public class Registry_AlgorithmStrategy {

    private final Map<String, I_ExecutableAlgorithm<?, ?>> byKey;

    public Registry_AlgorithmStrategy(List<I_ExecutableAlgorithm<?, ?>> algorithms) {
        Map<String, I_ExecutableAlgorithm<?, ?>> map = new LinkedHashMap<>();
        for (I_ExecutableAlgorithm<?, ?> algorithm : algorithms) {
            I_ExecutableAlgorithm<?, ?> previous = map.put(algorithm.getAlgorithm(), algorithm);
            if (previous != null) {
                throw new IllegalStateException(String.format(
                        "Duplicate algorithm key '%s': %s and %s",
                        algorithm.getAlgorithm(),
                        previous.getClass().getName(),
                        algorithm.getClass().getName()));
            }
        }
        this.byKey = Map.copyOf(map);
    }

    public Set<String> getRegisteredKeys() {
        return byKey.keySet();
    }

    public Map<String, String> getRegisteredVersions() {
        Map<String, String> versions = new LinkedHashMap<>();
        byKey.forEach((key, algorithm) -> versions.put(key, algorithm.getVersion()));
        return Map.copyOf(versions);
    }

    public Map<String, AlgorithmMetadata> getRegisteredMetadata() {
        Map<String, AlgorithmMetadata> metadata = new LinkedHashMap<>();
        byKey.forEach((key, algorithm) -> metadata.put(key, algorithm.getMetadata()));
        return Map.copyOf(metadata);
    }

    public Class<? extends I_AlgorithmInputs> getConfigClass(String key) {
        return get(key).getConfigClass();
    }

    public I_OutputData executeAlgorithm(String key, I_AlgorithmInputs config, I_ProgressListener pl) {
        return invoke(get(key), config, pl == null ? I_ProgressListener.NOOP : pl);
    }

    /**
     * Returns the strategy registered under {@code key}, or throws if unknown.
     * Exposed so callers can use typed strategy behaviour (e.g. summaries).
     */
    public I_ExecutableAlgorithm<?, ?> getStrategy(String key) {
        return get(key);
    }

    private I_ExecutableAlgorithm<?, ?> get(String key) {
        I_ExecutableAlgorithm<?, ?> algorithm = byKey.get(key);
        if (algorithm == null) {
            throw new IllegalArgumentException(String.format(
                    "The selected strategy (%s) is not registered as a valid strategy", key));
        }
        return algorithm;
    }

    private <C extends I_AlgorithmInputs, T extends I_OutputData> T invoke(
            I_ExecutableAlgorithm<C, T> algorithm, I_AlgorithmInputs config, I_ProgressListener pl) {

        Class<C> expected = algorithm.getConfigClass();
        if (!expected.isInstance(config)) {
            throw new IllegalArgumentException(String.format(
                    "Wrong config for algorithm '%s': expected %s but got %s",
                    algorithm.getAlgorithm(), expected.getSimpleName(),
                    config == null ? "null" : config.getClass().getSimpleName()));
        }
        return algorithm.execute(expected.cast(config), pl);
    }
}
