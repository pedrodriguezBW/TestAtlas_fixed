/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Interface.java to edit this template
 */
package com.borgwarner.testatlas.algorithm.interfaces;

/**
 *
 * @author adperez
 */
public interface I_AlgorithmInputs {

    /**
     * Username of the person who triggered the execution, for statistics.
     * Config records carrying platform credentials override this to return their
     * username; algorithms without credentials fall back to "unknown".
     *
     * @return the executor username, never {@code null}
     */
    default String executorUsername() {
        return "unknown";
    }
}
