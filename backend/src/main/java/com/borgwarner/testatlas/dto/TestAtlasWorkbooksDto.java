package com.borgwarner.testatlas.dto;

import java.util.List;

/** Inputs workbooks ({@code .xlsx} / {@code .xlsm}) already stored in a Test Atlas folder. */
public record TestAtlasWorkbooksDto(List<String> workbooks) {
}
