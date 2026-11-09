package com.borgwarner.testatlas.algorithm.impl.testatlas;

import java.util.List;
import java.util.Map;

/**
 * The complete, validated save plan of a Test Atlas request: every folder to
 * create, every file with its final name and destination, the evidence
 * checkpoints with their descriptors and the folders that must be renamed.
 * Building the plan never writes to the repository; it only reads it to detect
 * conflicts, so the user can review the exact result before saving.
 *
 * <p>Path lists hold folder components relative to the repository root.
 */
public record TestAtlasPlan(
        String testType,
        Map<String, String> fields,
        List<String> base,
        String folder,
        List<PlannedFile> files,
        List<PlannedEvidence> evidenceSets,
        List<Rename> renames,
        List<List<String>> directories,
        List<List<String>> existingWorkbooks,
        List<List<String>> generatedFiles) {

    /**
     * A file to save. {@code relative} is the destination after any checkpoint
     * folder rename; {@code checkRelative} is where the destination is on disk
     * now, used for conflict checks before saving.
     */
    public record PlannedFile(
            String id,
            String name,
            String category,
            long size,
            String mime,
            String captureDate,
            String dateSource,
            String evidenceId,
            List<String> targetParts,
            String targetName,
            String relative,
            String checkRelative,
            boolean conflict) {
    }

    /** An evidence checkpoint of the climatic workflow with its ordered photos. */
    public record PlannedEvidence(
            String id,
            String type,
            String title,
            String referenceType,
            String referenceValue,
            String notes,
            String existingFolder,
            int sequence,
            String folderName,
            List<String> path,
            List<String> sourcePath,
            List<PlannedFile> files) {
    }

    public record Rename(List<String> from, List<String> to) {
    }
}
