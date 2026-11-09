/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Interface.java to edit this template
 */
package com.borgwarner.testatlas.algorithm.interfaces;

import com.borgwarner.testatlas.algorithm.AlgorithmMetadata;


/**
 *
 * @author adperez
 * @param <C>
 */
public interface I_ExecutableAlgorithm<C extends I_AlgorithmInputs, T extends I_OutputData> {
    public String getAlgorithm();
    public String getVersion();
    default AlgorithmMetadata getMetadata() {
        return AlgorithmMetadata.EMPTY;
    }
    public Class<C> getConfigClass();
    T execute(C config, I_ProgressListener progress);

    /**
     * Builds a short human-readable summary of what the algorithm produced,
     * persisted in the execution statistics. Built only from the output object,
     * never from credentials.
     *
     * @param output the algorithm result
     * @return the summary text, never {@code null}
     */
    default String summarize(T output) {
        return "";
    }
}
