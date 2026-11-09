package com.borgwarner.testatlas.dto;

import java.util.List;

/**
 * Review of a Test Atlas save before anything is written: the repository root,
 * every folder that will exist (empty ones included), generated descriptors,
 * folders renamed by a checkpoint reorder, and each file with its final
 * destination and whether it already exists. Paths are relative to the
 * repository root and use the Windows separator.
 */
public record TestAtlasPlanDto(
        String root,
        String folder,
        List<String> directories,
        List<String> existingWorkbooks,
        List<String> generatedFiles,
        List<RenamedFolderDto> renamedFolders,
        List<PlannedFileDto> files) {

    public record RenamedFolderDto(String from, String to) {
    }

    public record PlannedFileDto(
            String id,
            String name,
            String category,
            long size,
            String relative,
            boolean conflict) {
    }
}
