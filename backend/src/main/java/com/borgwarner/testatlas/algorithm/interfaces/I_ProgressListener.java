/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Interface.java to edit this template
 */
package com.borgwarner.testatlas.algorithm.interfaces;

/**
 *
 * @author adperez
 */
@FunctionalInterface
public interface I_ProgressListener {
    void report(int current, int total, String message);

    I_ProgressListener NOOP = (current, total, message) -> { };
}