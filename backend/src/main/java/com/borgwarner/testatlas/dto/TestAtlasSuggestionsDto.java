package com.borgwarner.testatlas.dto;

import java.util.List;

/**
 * Names already present in the Test Atlas project repository, used to keep
 * program, phase, test and batch names consistent with previous tests.
 * {@code tests} is filled for the climatic workflow and {@code batches} for the
 * vibration workflow; the other list is empty.
 */
public record TestAtlasSuggestionsDto(
        List<ProgramSuggestionDto> programs,
        List<String> phases,
        List<String> tests,
        List<String> batches) {

    public record ProgramSuggestionDto(String number, String name, String folder) {
    }
}
