package com.borgwarner.testatlas.service;

import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlanner;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepository;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader.EvidencePhoto;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasStaging;
import com.borgwarner.testatlas.dto.TestAtlasPlanDto;
import com.borgwarner.testatlas.dto.TestAtlasPlanDto.PlannedFileDto;
import com.borgwarner.testatlas.dto.TestAtlasPlanDto.RenamedFolderDto;
import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto;
import com.borgwarner.testatlas.dto.TestAtlasUploadDto;
import com.borgwarner.testatlas.dto.TestAtlasWorkbooksDto;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Auxiliary operations of the Test Atlas form that run before the algorithm:
 * the review of a save plan, the staging upload of its files and read-only
 * lookups of the project repository. The save itself is the
 * {@code TEST_ATLAS} algorithm.
 */
@Service
public class TestAtlasService {

    private final TestAtlasRepository repository;
    private final TestAtlasPlanner planner;
    private final TestAtlasRepositoryReader reader;
    private final TestAtlasStaging staging;

    public TestAtlasService(
            TestAtlasRepository repository,
            TestAtlasPlanner planner,
            TestAtlasRepositoryReader reader,
            TestAtlasStaging staging) {
        this.repository = repository;
        this.planner = planner;
        this.reader = reader;
        this.staging = staging;
    }

    /** Validate the manifest and return the planned tree, names and conflicts. Nothing is written. */
    public TestAtlasPlanDto plan(Conf_TestAtlas request) {
        return toDto(planner.plan(request));
    }

    /** Validate the manifest again and open a staging upload for its files. */
    public TestAtlasUploadDto createUpload(Conf_TestAtlas request) {
        return new TestAtlasUploadDto(staging.create(planner.plan(request)));
    }

    public void storeFile(String uploadId, String fileId, InputStream content) {
        staging.store(uploadId, fileId, content);
    }

    public void cancelUpload(String uploadId) {
        staging.discard(uploadId);
    }

    public TestAtlasSuggestionsDto suggestions(String testType, String query, String program, String phase) {
        return reader.suggestions(testType, query, program, phase);
    }

    public TestAtlasWorkbooksDto existingInputs(String programNumber, String programName, String phase, String testNumber) {
        List<String> inputs = new ArrayList<>(
                TestAtlasRepositoryReader.climaticBase(programNumber, programName, phase, testNumber));
        inputs.add("01_Inputs");
        return new TestAtlasWorkbooksDto(reader.existingInputWorkbooks(inputs));
    }

    public TestAtlasTestStateDto testState(String programNumber, String programName, String phase, String testNumber) {
        return reader.testState(TestAtlasRepositoryReader.climaticBase(programNumber, programName, phase, testNumber));
    }

    public EvidencePhoto evidencePhoto(String programNumber, String programName, String phase, String testNumber,
            String folder, String name) {
        return reader.evidencePhoto(
                TestAtlasRepositoryReader.climaticBase(programNumber, programName, phase, testNumber), folder, name);
    }

    public TestAtlasWorkbooksDto sampleInputs(String programNumber, String programName, String phase, String batchName,
            String testCode, String testType, String axis, String materialMasterCode) {
        return new TestAtlasWorkbooksDto(reader.sampleInputs(
                programNumber, programName, phase, batchName, testCode, testType, axis, materialMasterCode));
    }

    private TestAtlasPlanDto toDto(TestAtlasPlan plan) {
        return new TestAtlasPlanDto(
                repository.forType(plan.testType()).root().toString(),
                plan.folder(),
                plan.directories().stream().map(TestAtlasNames::join).toList(),
                plan.existingWorkbooks().stream().map(TestAtlasNames::join).toList(),
                plan.generatedFiles().stream().map(TestAtlasNames::join).toList(),
                plan.renames().stream()
                        .map(rename -> new RenamedFolderDto(TestAtlasNames.join(rename.from()), TestAtlasNames.join(rename.to())))
                        .toList(),
                plan.files().stream()
                        .map(file -> new PlannedFileDto(
                                file.id(), file.name(), file.category(), file.size(), file.relative(), file.conflict()))
                        .toList());
    }
}
