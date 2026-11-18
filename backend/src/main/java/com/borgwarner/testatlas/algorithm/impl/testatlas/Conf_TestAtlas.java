package com.borgwarner.testatlas.algorithm.impl.testatlas;

import com.borgwarner.testatlas.algorithm.interfaces.I_AlgorithmInputs;
import java.util.List;

/**
 * Test Atlas save request: the manifest reviewed by the user plus the staging
 * upload that holds the file contents.
 *
 * <p>The shape matches the JSON manifest of the original Test Atlas
 * ({@code POST /api/plan}): {@code testType} selects the workflow and the
 * remaining fields belong either to the climatic workflow ({@code testNumber},
 * {@code files}, {@code evidenceSets}) or to the vibration workflow
 * ({@code batchName}, {@code inputsWorkbook}, {@code tests}). {@code date}
 * ({@code YYMMDD}) is used by both to name the inputs workbooks. Fields of the
 * other workflow are ignored.
 *
 * <p>File contents never travel in this record. They are streamed beforehand
 * into the staging upload identified by {@code uploadId}
 * ({@code POST /api/test-atlas/uploads}); {@code approvedOverwrites} lists the
 * identifiers of the reviewed files whose existing destination may be replaced.
 * Validation happens in {@link TestAtlasPlanner}, so the auxiliary review
 * endpoint and the algorithm share exactly the same rules.
 */
public record Conf_TestAtlas(
        String testType,
        String programNumber,
        String programName,
        String phase,
        String testNumber,
        String date,
        List<FileEntry> files,
        List<EvidenceSet> evidenceSets,
        String batchName,
        FileEntry inputsWorkbook,
        List<VibrationTest> tests,
        String uploadId,
        List<String> approvedOverwrites) implements I_AlgorithmInputs {

    /**
     * One file declared by the browser. {@code category} is only used by the
     * climatic workflow; {@code captureDate} ({@code YYYY-MM-DDTHH:MM:SS}) and
     * {@code dateSource} ({@code metadata}, {@code modified} or {@code test})
     * only by evidence photos.
     */
    public record FileEntry(
            String id,
            String name,
            String category,
            Long size,
            String mime,
            String captureDate,
            String dateSource) {
    }

    /**
     * A climatic evidence checkpoint. {@code existingFolder} names the folder
     * already saved in the repository when the checkpoint is being reordered.
     */
    public record EvidenceSet(
            String id,
            String type,
            String title,
            String referenceType,
            String referenceValue,
            String notes,
            String existingFolder,
            List<FileEntry> files) {
    }

    /** A vibration test ({@code TEST - testCode - testType - axis} folder) and its samples. */
    public record VibrationTest(
            String id,
            String testCode,
            String testType,
            String axis,
            List<MaterialMaster> materialMasters) {
    }

    /**
     * A vibration sample (Material Master, {@code MM - code} folder). Exactly one
     * of {@code inputsWorkbook} (new upload, renamed) or {@code existingWorkbook}
     * (file already in the sample's {@code 01_Inputs}) is expected.
     * {@code evidenceSets} are the photo checkpoints of {@code 02_Evidences}
     * (Initial first, Final last; photos keep their original names); results,
     * characterization and CANoe files go to {@code 03_Data} and the optional
     * {@code test_metadata.json} to {@code 04_Report}.
     */
    public record MaterialMaster(
            String id,
            String materialMasterCode,
            FileEntry inputsWorkbook,
            String existingWorkbook,
            List<EvidenceSet> evidenceSets,
            List<FileEntry> results,
            List<FileEntry> characterization,
            List<FileEntry> canoe,
            FileEntry metadata) {
    }
}
