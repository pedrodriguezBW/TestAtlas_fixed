package com.borgwarner.testatlas.algorithm.impl;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.EvidenceSet;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.FileEntry;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.MaterialMaster;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.VibrationTest;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Out_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Strategy_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasException;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedFile;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlanner;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepository;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasStaging;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto;
import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto.ProgramSuggestionDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto.SavedEvidenceDto;
import com.borgwarner.testatlas.service.TestAtlasService;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.function.Executable;
import tools.jackson.databind.ObjectMapper;

/**
 * Port of {@code tests/organization.test.js} of the original Test Atlas. The
 * same manifests must produce the same folders, file names, descriptors and
 * rejections. The HTTP session of the original (plan -> session -> PUT files ->
 * commit) maps to plan -> staging upload -> {@code TEST_ATLAS} run.
 */
class TestAtlasTest {

    private static final byte[] BYTES = "fixture content".getBytes(UTF_8);

    @TempDir
    Path repositoryDir;
    @TempDir
    Path stagingDir;

    private TestAtlasRepository repository;
    private TestAtlasRepositoryReader reader;
    private TestAtlasPlanner planner;
    private TestAtlasStaging staging;
    private Strategy_TestAtlas strategy;
    private TestAtlasService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        repository = new TestAtlasRepository(repositoryDir.toString());
        reader = new TestAtlasRepositoryReader(repository, mapper);
        planner = new TestAtlasPlanner(repository, reader);
        staging = new TestAtlasStaging(stagingDir.toString(), mapper);
        strategy = new Strategy_TestAtlas(repository, planner, reader, staging, mapper);
        service = new TestAtlasService(repository, planner, reader, staging);
    }

    // ------------------------------------------------------------------ vibration

    @Test
    void vibrationHierarchyUsesClimaticSeparatorsAndTheFourClimaticBlocksBelowTheMaterialMaster() throws IOException {
        VibRequest request = vibration("0000");
        VibSample a = request.tests.get(0).materialMasters.get(0);
        a.evidenceSets.clear();
        a.evidenceSets.addAll(List.of(
                evidence("initial", "", List.of(upload("IMG_0001.JPG", "image/jpeg")), ""),
                evidence("planned_inspection", "", List.of(upload("screenshot.png", "image/png")), "", "cycles", "250", null),
                evidence("incident", "", List.of(upload("resonance.png", "image/png")), "", "stage", "Resonance", null),
                evidence("final", "", List.of(upload("final view.heic")), "")));
        a.results.addAll(List.of(upload("results.custom-format"), upload("measurements.csv"),
                upload("alarm log.txt"), upload("long-name-".repeat(11) + ".csv")));
        a.characterization.addAll(List.of(upload("before.swp2"), upload("comparison.pdf")));
        a.canoe.add(upload("bus.blf"));
        byte[] json = "{\"test\": \"IN260501-01\"}".getBytes(UTF_8);
        a.metadata = new FileEntry(UUID.randomUUID().toString(), "test_metadata.json", null, (long) json.length,
                "application/json", null, null);
        VibSample b = sample("14123456A");
        request.tests.get(0).materialMasters.add(b);
        VibTest second = new VibTest("IN260501-02", "Custom Sweep", "XY");
        second.materialMasters = new ArrayList<>(List.of(sample("P1234567")));
        request.tests.add(second);

        TestAtlasPlan p = plan(request.build());
        String batch = "0000 - Ejemplo\\DV\\BATCH - 01 - Validacion";
        String mm = batch + "\\TEST - IN260501-01 - FSweep - Z\\MM - ABC12345";
        assertEquals(batch, p.folder());
        assertEquals(mm, String.join("\\", sampleParts(request)));
        assertEquals(batch + "\\260501_VB_Inputs_Ejemplo_DV_01 - Validacion.xlsm",
                p.files().stream().filter(f -> f.category().equals("inputs")).findFirst().orElseThrow().relative());
        List<String> relatives = p.files().stream().map(PlannedFile::relative).toList();
        for (String expected : List.of(
                mm + "\\01_Inputs\\260501_VB_Inputs_Ejemplo_DV_01 - Validacion_FSweep_Z.xlsm",
                mm + "\\02_Evidences\\00_Initial\\IMG_0001.JPG",
                mm + "\\02_Evidences\\01_Inspection_250Cycles\\screenshot.png",
                mm + "\\02_Evidences\\02_Incident_Stage-Resonance\\resonance.png",
                mm + "\\02_Evidences\\99_Final\\final view.heic",
                mm + "\\03_Data\\01_Results\\alarm log.txt",
                mm + "\\03_Data\\02_Characterization\\before.swp2",
                mm + "\\03_Data\\03_CANoe\\bus.blf",
                mm + "\\04_Report\\test_metadata.json",
                batch + "\\TEST - IN260501-02 - Custom Sweep - XY\\MM - P1234567\\01_Inputs\\"
                        + "260501_VB_Inputs_Ejemplo_DV_01 - Validacion_Custom Sweep_XY.xlsm")) {
            assertTrue(relatives.contains(expected), expected);
        }
        assertEquals(0, p.evidenceSets().size()); // vibration checkpoints have no evidence.json
        assertEquals(List.of(), list(repositoryDir));

        String uploadId = stage(p, json);
        assertEquals(List.of(), list(repositoryDir)); // All uploads are still staged elsewhere.
        Out_TestAtlas result = commit(request.build(), uploadId, List.of());
        assertEquals(p.files().size(), result.saved().size());
        for (PlannedFile file : p.files()) {
            assertArrayEquals(file.category().equals("metadata") ? json : BYTES,
                    Files.readAllBytes(absolute(file.relative())));
        }
        for (List<String> folder : p.directories()) {
            assertTrue(Files.isDirectory(absolute(TestAtlasNames.join(folder))));
        }
        assertEquals(List.of("01_Inputs", "02_Evidences", "03_Data", "04_Report"), list(absolute(mm)));
        assertEquals(List.of("00_Initial", "01_Inspection_250Cycles", "02_Incident_Stage-Resonance", "99_Final"),
                list(absolute(mm + "\\02_Evidences")));
        assertEquals(List.of("01_Results", "02_Characterization", "03_CANoe"), list(absolute(mm + "\\03_Data")));
        // A sample without photos still gets its Initial and Final checkpoints and every block.
        String other = batch + "\\TEST - IN260501-02 - Custom Sweep - XY\\MM - P1234567";
        assertEquals(List.of("00_Initial", "99_Final"), list(absolute(other + "\\02_Evidences")));
        assertEquals(List.of(), list(absolute(other + "\\04_Report")));
        assertEquals(List.of("260501_VB_Inputs_Ejemplo_DV_01 - Validacion.xlsm", "TEST - IN260501-01 - FSweep - Z",
                "TEST - IN260501-02 - Custom Sweep - XY"), list(absolute(batch)));
        assertEquals(repositoryDir.resolve(Path.of("0000 - Ejemplo", "DV", "BATCH - 01 - Validacion")).toString(),
                result.folderPath());
    }

    @Test
    void newCheckpointsAreNumberedAfterTheSavedOnesWhichAreNeverRenamed() throws IOException {
        VibRequest first = vibration("0000");
        first.tests.get(0).materialMasters.get(0).evidenceSets.add(1,
                evidence("planned_inspection", "", List.of(upload("a.jpg", "image/jpeg")), "", "cycles", "250", null));
        commit(first.build(), stage(plan(first.build())), List.of());

        VibRequest next = vibration("0000");
        VibSample s = next.tests.get(0).materialMasters.get(0);
        s.inputsWorkbook = null;
        s.existingWorkbook = "260501_VB_Inputs_Ejemplo_DV_01 - Validacion_FSweep_Z.xlsm";
        s.evidenceSets.add(1, evidence("incident", "", List.of(upload("b.jpg", "image/jpeg")), "", "stage", "Resonance", null));
        s.evidenceSets.add(2, evidence("restart", ""));
        TestAtlasPlan p = plan(next.build());
        commit(next.build(), stage(p), conflicts(p));
        String evidences = String.join("\\", sampleParts(next)) + "\\02_Evidences";
        assertEquals(List.of("00_Initial", "01_Inspection_250Cycles", "02_Incident_Stage-Resonance", "03_Restart", "99_Final"),
                list(absolute(evidences)));
        assertEquals(List.of("a.jpg"), list(absolute(evidences + "\\01_Inspection_250Cycles")));
        assertEquals(List.of("b.jpg"), list(absolute(evidences + "\\02_Incident_Stage-Resonance")));
    }

    @Test
    void sampleInputsCanBeDiscoveredAndReusedButMissingWorkbooksBlockReviewAndCommit() throws IOException {
        // The batch saved by the first scenario.
        VibRequest first = vibration("0000");
        commit(first.build(), stage(plan(first.build())), List.of());
        String saved = "260501_VB_Inputs_Ejemplo_DV_01 - Validacion_FSweep_Z.xlsm";

        VibRequest r = vibration("0000");
        VibSample s = r.tests.get(0).materialMasters.get(0);
        s.inputsWorkbook = null;
        s.existingWorkbook = saved;
        VibTest t = r.tests.get(0);
        List<String> found = reader.sampleInputs(r.programNumber, r.programName, r.phase, r.batchName,
                t.testCode, t.testType, t.axis, s.materialMasterCode);
        assertEquals(List.of(saved), found);

        s.results.add(upload("additional.log"));
        TestAtlasPlan p = plan(r.build());
        assertEquals(1, p.existingWorkbooks().size());
        assertEquals(0, p.files().stream().filter(f -> f.category().equals("sampleInputs")).count());
        commit(r.build(), stage(p), conflicts(p));
        Path workbook = absolute(String.join("\\", sampleParts(r)) + "\\01_Inputs\\" + s.existingWorkbook);
        assertArrayEquals(BYTES, Files.readAllBytes(workbook));

        s.existingWorkbook = "missing.xlsx";
        assertFails(() -> plan(r.build()), 400, "(?i)inputs workbook");
        s.existingWorkbook = saved;
        TestAtlasPlan p2 = plan(r.build());
        String staged = stage(p2);
        Files.move(workbook, Path.of(workbook + ".backup"));
        try {
            // The plan is recalculated when the algorithm runs, so the missing
            // workbook is reported by the planner (400) instead of the commit (409).
            assertBlocked(() -> commit(r.build(), staged, conflicts(p2)), "(?i)workbook");
            assertFalse(Files.exists(workbook));
        } finally {
            Files.move(Path.of(workbook + ".backup"), workbook);
        }
    }

    @Test
    void vibrationSuggestionsOnlyOfferFoldersWithTheExpectedStructure() throws IOException {
        VibRequest first = vibration("0000");
        commit(first.build(), stage(plan(first.build())), List.of());
        // Folders saved with the previous naming stay as they are and are not suggested.
        Files.createDirectories(repositoryDir.resolve(Path.of("0000_Ejemplo", "01_DV", "01_Tanda_Validacion")));
        Files.createDirectories(repositoryDir.resolve(Path.of("0000 - Ejemplo", "DV", "02_Tanda_Antigua")));

        TestAtlasSuggestionsDto r = reader.suggestions("vibration", "ejem", "0000 - Ejemplo", "DV");
        assertEquals(List.of(new ProgramSuggestionDto("0000", "Ejemplo", "0000 - Ejemplo")), r.programs());
        assertEquals(List.of("DV"), r.phases());
        assertEquals(List.of("01 - Validacion"), reader.suggestions("vibration", "valid", "0000 - Ejemplo", "DV").batches());
        assertEquals(List.of("01 - Validacion"), reader.suggestions("vibration", "", "0000 - Ejemplo", "DV").batches());
    }

    @Test
    void vibrationTestsAreSavedInTheirOwnRepositoryRoot(@TempDir Path climaticRoot) throws IOException {
        TestAtlasRepository roots = new TestAtlasRepository(climaticRoot.toString(), repositoryDir.toString());
        reader = new TestAtlasRepositoryReader(roots, mapper);
        planner = new TestAtlasPlanner(roots, reader);
        strategy = new Strategy_TestAtlas(roots, planner, reader, staging, mapper);
        service = new TestAtlasService(roots, planner, reader, staging);

        VibRequest r = vibration("0000");
        assertEquals(repositoryDir.toAbsolutePath().normalize().toString(), service.plan(r.build()).root());
        Out_TestAtlas saved = commit(r.build(), stage(plan(r.build())), List.of());
        assertEquals(repositoryDir.resolve(Path.of("0000 - Ejemplo", "DV", "BATCH - 01 - Validacion")).toString(),
                saved.folderPath());
        assertEquals(List.of(), list(climaticRoot));
        assertEquals(List.of("01 - Validacion"),
                reader.suggestions("vibration", "", "0000 - Ejemplo", "DV").batches());

        ClimRequest climatic = climatic("11111", "Repo", "DV", "1", "261013");
        climatic.files.add(file("in.xlsx", "inputs"));
        climatic.evidenceSets.addAll(sets());
        assertEquals(climaticRoot.toAbsolutePath().normalize().toString(), service.plan(climatic.build()).root());
        commit(climatic.build(), stage(plan(climatic.build())), List.of());
        assertEquals(List.of("11111 - Repo"), list(climaticRoot));
        assertEquals(List.of("0000 - Ejemplo"), list(repositoryDir));
    }

    @Test
    void invalidHierarchyDuplicateCodesInvalidFilesAndCheckpointsAreRejected() {
        record Case(Consumer<VibRequest> change, String message) {
        }
        List<Case> cases = List.of(
                new Case(r -> {
                    VibTest copy = new VibTest(r.tests.get(0).testCode, r.tests.get(0).testType, r.tests.get(0).axis);
                    copy.materialMasters = new ArrayList<>(List.of(sample("Other")));
                    r.tests.add(copy);
                }, "Duplicate test folder"),
                new Case(r -> r.tests.get(0).materialMasters.add(sample("abc12345")), "Duplicate Material Master"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).materialMasterCode = "..", "valid"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).results.addAll(
                        List.of(upload("duplicate.csv"), upload("DUPLICATE.csv"))), "same destination"),
                new Case(r -> r.inputsWorkbook = upload("inputs.csv"), "xlsx"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).inputsWorkbook = null, "inputs workbook"),
                new Case(r -> r.date = "2605", "YYMMDD"),
                new Case(r -> r.date = "261341", "real test date"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).evidenceSets.set(0,
                        evidence("initial", "", List.of(upload("alarm.txt")), "")), "only accept images"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).evidenceSets.remove(1), "Initial and Final"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).evidenceSets.add(evidence("other", "")),
                        "Final evidence must be last"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).evidenceSets.add(1,
                        evidence("incident", "", List.of(), "", "stage", "", null)), "reference value"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).canoe.add(upload("trace.txt")), "CANoe accepts"),
                new Case(r -> r.tests.get(0).materialMasters.get(0).metadata = upload("metadata.json"), "named exactly"),
                new Case(r -> r.nullTest = true, "Invalid vibration test"),
                new Case(r -> r.tests.get(0).nullSample = true, "Invalid Material Master"));
        for (Case item : cases) {
            VibRequest request = vibration("INVALID");
            item.change().accept(request);
            assertFails(() -> plan(request.build()), 400, item.message());
        }
        assertFalse(Files.exists(repositoryDir.resolve("INVALID - Ejemplo")));
    }

    @Test
    void overwriteApprovalIsMandatoryAndConflictsAppearingAfterReviewOrUploadBlockSaving() throws IOException {
        VibRequest r = vibration("OVERWRITE");
        TestAtlasPlan p = plan(r.build());
        Path target = absolute(p.files().get(0).relative());
        Files.createDirectories(target.getParent());
        Files.writeString(target, "existing content");
        // The review made before the file appeared cannot be saved without a decision.
        assertFails(() -> commit(r.build(), stage(p), List.of()), 409, "replace");
        TestAtlasPlan reviewed = plan(r.build());
        assertTrue(reviewed.files().get(0).conflict());
        assertFails(() -> commit(r.build(), stage(reviewed), List.of()), 409, "replace");
        assertEquals("existing content", Files.readString(target));
        commit(r.build(), stage(reviewed), List.of(reviewed.files().get(0).id()));
        assertArrayEquals(BYTES, Files.readAllBytes(target));

        VibRequest late = vibration("NEWCONFLICT");
        TestAtlasPlan latePlan = plan(late.build());
        String session = stage(latePlan);
        Path appeared = absolute(latePlan.files().get(0).relative());
        Files.createDirectories(appeared.getParent());
        Files.writeString(appeared, "appeared during upload");
        assertFails(() -> commit(late.build(), session, List.of()), 409, "(replace|New conflict)");
        assertEquals("appeared during upload", Files.readString(appeared));
    }

    @Test
    void existingFilesCannotBecomeDirectoriesAndLinksCannotRedirectVibrationSaves() throws IOException {
        Files.writeString(repositoryDir.resolve("OCCUPIED - Ejemplo"), "ordinary file");
        assertFails(() -> plan(vibration("OCCUPIED").build()), 400, "occupies");

        Path target = Files.createTempDirectory(repositoryDir, "link-target-");
        try {
            Files.createSymbolicLink(repositoryDir.resolve("LINKED - Ejemplo"), target);
        } catch (IOException | UnsupportedOperationException | SecurityException exception) {
            Assumptions.abort("Symbolic links cannot be created on this machine: " + exception.getMessage());
        }
        assertFails(() -> plan(vibration("LINKED").build()), 400, "(?i)link");
        assertEquals(List.of(), list(target));
    }

    // ------------------------------------------------------------------- climatic

    @Test
    void climaticNamesEvidenceMetadataCheckpointsDataAndReportDirectoriesRemainIntact() throws IOException {
        FileEntry photo = photo("before.jpg", "2026-09-30T10:00:00", null);
        ClimRequest r = climatic("80025", "BMW", "DV", "486", "260930");
        r.files.addAll(List.of(file("input.xlsm", "inputs"), file("chamber.x03", "simpati"), file("data.csv", "graphtec")));
        r.evidenceSets.addAll(List.of(
                evidence("initial", "Initial condition", List.of(photo), "Preserve this note"),
                evidence("planned_inspection", "Inspection", List.of(), "Preserve this note"),
                evidence("final", "Final condition", List.of(), "Preserve this note")));

        TestAtlasPlan p = plan(r.build());
        assertEquals("80025 - BMW\\DV\\TEST - 486", p.folder());
        assertTrue(p.files().stream().anyMatch(f ->
                f.relative().equals(p.folder() + "\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm")));
        Out_TestAtlas saved = commit(r.build(), stage(p), List.of());
        assertEquals(4, saved.saved().size());
        assertEquals(List.of("01_Inputs", "02_Evidences", "03_Data", "04_Report"), list(absolute(p.folder())));
        Path evidenceRoot = absolute(p.folder() + "\\02_Evidences");
        List<String> groups = list(evidenceRoot);
        assertEquals(3, groups.size());
        for (String group : groups) {
            assertEquals("Preserve this note", descriptor(evidenceRoot.resolve(group)).get("notes"));
        }
        TestAtlasSuggestionsDto suggestions = reader.suggestions("climatic", "486", "80025 - BMW", "DV");
        assertEquals(List.of("486"), suggestions.tests());

        r.evidenceSets.set(0, evidence("initial", "Initial condition",
                List.of(new FileEntry(photo.id(), photo.name(), null, photo.size(), photo.mime(), null, null)), "Preserve this note"));
        assertFails(() -> plan(r.build()), 400, "capture date");
    }

    @Test
    void climaticSimpatiFormatsUnifiedGraphtecCanoeReviewTreeAndOptionalInputsForAnExistingTest() throws IOException {
        String folder = "90001 - Audi\\PV\\TEST - 512";
        List<String> simpatiOk = List.of("archive.x01", "archive.X03", "archive.x99", "program.p03", "program.b12");

        // A new test without an inputs workbook is rejected.
        ClimRequest missing = base512();
        missing.files.add(file("chamber.x03", "simpati"));
        missing.evidenceSets.addAll(sets());
        assertFails(() -> plan(missing.build()), 400, "(?i)inputs");
        assertEquals(List.of(), service.existingInputs("90001", "Audi", "PV", "512").workbooks());

        // Unsupported SIMPATI formats are rejected; Graphtec accepts any format.
        for (String name : List.of("data.x100", "data.y03", "data.x3", "macro.exe", "export.csv", "report.pdf")) {
            ClimRequest r = base512();
            r.files.addAll(List.of(file("in.xlsx", "inputs"), file(name, "simpati")));
            r.evidenceSets.addAll(sets());
            assertFails(() -> plan(r.build()), 400, "SIMPATI");
        }
        ClimRequest firstRequest = base512();
        firstRequest.files.add(file("in.xlsx", "inputs"));
        simpatiOk.forEach(name -> firstRequest.files.add(file(name, "simpati")));
        firstRequest.files.addAll(List.of(
                file("logger.GBD", "graphtec"), file("no-extension", "graphtec"), file("trace.custom-format", "graphtec"),
                // Formerly separate CSV / Excel and Datalogger files now go to Graphtec too.
                file("table.csv", "graphtec"), file("sheet.xlsx", "graphtec"), file("datalogger.dat", "graphtec"),
                file("bus.blf", "canoe"), file("bus.ASC", "canoe"), file("signals.mf4", "canoe"),
                file("old.mdf", "canoe"), file("eth.pcap", "canoe"), file("eth.pcapng", "canoe")));
        firstRequest.evidenceSets.addAll(sets());
        TestAtlasPlan first = plan(firstRequest.build());
        List<String> directories = first.directories().stream().map(TestAtlasNames::join).toList();
        assertTrue(directories.contains(folder + "\\03_Data\\02_Graphtec"));
        assertTrue(directories.contains(folder + "\\03_Data\\03_CANoe"));
        assertEquals(List.of(folder, folder + "\\01_Inputs", folder + "\\02_Evidences"), directories.subList(0, 3));
        assertTrue(directories.contains(folder + "\\04_Report"));
        assertEquals(List.of(folder + "\\02_Evidences\\00_Initial\\evidence.json", folder + "\\02_Evidences\\99_Final\\evidence.json"),
                first.generatedFiles().stream().map(TestAtlasNames::join).toList());
        assertEquals(List.of(), first.existingWorkbooks());
        assertTrue(first.files().stream().anyMatch(f -> f.relative().equals(folder + "\\03_Data\\02_Graphtec\\logger.GBD")));
        assertTrue(first.files().stream().anyMatch(f -> f.relative().equals(folder + "\\03_Data\\03_CANoe\\bus.blf")));
        assertTrue(first.files().stream().anyMatch(f -> f.relative().equals(folder + "\\03_Data\\01_SIMPATI\\program.b12")));
        commit(firstRequest.build(), stage(first), List.of());
        assertEquals(List.of("01_SIMPATI", "02_Graphtec", "03_CANoe"), list(absolute(folder + "\\03_Data")));
        assertEquals(6, list(absolute(folder + "\\03_Data\\02_Graphtec")).size());
        assertEquals(6, list(absolute(folder + "\\03_Data\\03_CANoe")).size());

        // CANoe only accepts its logging formats; the old categories no longer exist.
        for (String[] item : new String[][] {{"bus.csv", "canoe"}, {"config.cfg", "canoe"}, {"bus", "canoe"},
                {"data.csv", "csv"}, {"log.dat", "datalogger"}}) {
            ClimRequest r = base512();
            r.files.add(file(item[0], item[1]));
            r.evidenceSets.addAll(sets());
            assertFails(() -> plan(r.build()), 400, ".");
        }

        // A follow-up save of the same test can skip the inputs workbook.
        assertEquals(List.of("261006_CL_Inputs_Audi_PV_512.xlsx"), service.existingInputs("90001", "Audi", "PV", "512").workbooks());
        ClimRequest followUpRequest = base512();
        followUpRequest.files.add(file("later.csv", "graphtec"));
        followUpRequest.evidenceSets.addAll(sets());
        TestAtlasPlan followUp = plan(followUpRequest.build());
        assertEquals(List.of(folder + "\\01_Inputs\\261006_CL_Inputs_Audi_PV_512.xlsx"),
                followUp.existingWorkbooks().stream().map(TestAtlasNames::join).toList());
        assertEquals(1, followUp.files().size());
        String keptPath = TestAtlasNames.join(followUp.existingWorkbooks().get(0));
        byte[] kept = Files.readAllBytes(absolute(keptPath));
        commit(followUpRequest.build(), stage(followUp), List.of());
        assertArrayEquals(kept, Files.readAllBytes(absolute(keptPath)));
        assertTrue(list(absolute(folder + "\\03_Data\\02_Graphtec")).contains("later.csv"));

        // A save with no new files is allowed (e.g. only a new checkpoint) and
        // creates the checkpoint folder and its record.
        EvidenceSet checkpoint = evidence("planned_inspection", "Inspection after 250 cycles", List.of(), "", "cycles", "250", null);
        ClimRequest noFilesRequest = base512();
        noFilesRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial condition"), checkpoint, evidence("final", "Final condition")));
        TestAtlasPlan noFiles = plan(noFilesRequest.build());
        assertEquals(0, noFiles.files().size());
        assertEquals(0, commit(noFilesRequest.build(), stage(noFiles), List.of()).saved().size());
        assertTrue(list(absolute(folder + "\\02_Evidences\\01_Inspection_250Cycles")).contains("evidence.json"));

        // A workbook removed after review blocks the commit.
        EvidenceSet savedCheckpoint = evidence("planned_inspection", "Inspection after 250 cycles", List.of(), "", "none", "", "01_Inspection_250Cycles");
        ClimRequest removedRequest = base512();
        removedRequest.files.add(file("again.csv", "graphtec"));
        removedRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial condition"), savedCheckpoint, evidence("final", "Final condition")));
        TestAtlasPlan removedAfterReview = plan(removedRequest.build());
        String session = stage(removedAfterReview);
        Files.delete(absolute(TestAtlasNames.join(removedAfterReview.existingWorkbooks().get(0))));
        assertBlocked(() -> commit(removedRequest.build(), session, List.of()), "(?i)inputs");
        assertFalse(Files.exists(absolute(folder + "\\03_Data\\02_Graphtec\\again.csv")));
        assertFails(() -> plan(removedRequest.build()), 400, "(?i)inputs");
    }

    @Test
    void climaticExcelInGraphtecMetadataSavedEvidencePhotoDateSourcesAndReorderedCheckpointFolders() throws IOException {
        String folder = "70010 - Volvo\\DV\\TEST - 77";
        EvidenceSet inspection = evidence("planned_inspection", "Inspection",
                List.of(photo("a.jpg", "2026-10-08T09:00:00", "modified")), "", "cycles", "100", null);
        EvidenceSet incident = evidence("incident", "Incident",
                List.of(photo("b.jpg", "2026-10-08T00:00:00", "test")), "");

        // Excel tables go to 02_Graphtec; the metadata file must have the exact name and be valid JSON.
        for (String name : List.of("metadata.json", "Test_Metadata.json", "test_metadata.txt")) {
            ClimRequest r = base77();
            r.files.addAll(List.of(file("in.xlsx", "inputs"), file(name, "metadata")));
            r.evidenceSets.addAll(List.of(evidence("initial", "Initial"), evidence("final", "Final")));
            assertFails(() -> plan(r.build()), 400, "test_metadata.json");
        }
        ClimRequest pdfInCanoe = base77();
        pdfInCanoe.files.addAll(List.of(file("in.xlsx", "inputs"), file("data.pdf", "canoe")));
        pdfInCanoe.evidenceSets.addAll(List.of(evidence("initial", "Initial"), evidence("final", "Final")));
        assertFails(() -> plan(pdfInCanoe.build()), 400, "CANoe");

        ClimRequest invalidJsonRequest = base77();
        invalidJsonRequest.files.addAll(List.of(file("in.xlsx", "inputs"), file("test_metadata.json", "metadata")));
        invalidJsonRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial"), evidence("final", "Final")));
        TestAtlasPlan invalidJson = plan(invalidJsonRequest.build());
        String badSession = staging.create(invalidJson);
        String metadataId = invalidJson.files().stream().filter(f -> f.category().equals("metadata")).findFirst().orElseThrow().id();
        assertFails(() -> staging.store(badSession, metadataId, new ByteArrayInputStream(BYTES)), 400, "valid JSON");
        staging.discard(badSession);

        byte[] json = "{\"test\": 77}".getBytes(UTF_8);
        FileEntry metadata = new FileEntry(UUID.randomUUID().toString(), "test_metadata.json", "metadata", (long) json.length, "application/json", null, null);
        ClimRequest firstRequest = base77();
        firstRequest.files.addAll(List.of(file("in.xlsx", "inputs"), file("table.xlsx", "graphtec"), file("old.xls", "graphtec"), metadata));
        firstRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial"), inspection, incident, evidence("final", "Final")));
        TestAtlasPlan first = plan(firstRequest.build());
        assertTrue(first.files().stream().anyMatch(f -> f.relative().equals(folder + "\\03_Data\\02_Graphtec\\table.xlsx")));
        assertEquals(folder + "\\04_Report\\test_metadata.json",
                first.files().stream().filter(f -> f.category().equals("metadata")).findFirst().orElseThrow().relative());
        commit(firstRequest.build(), stage(first, json), List.of());
        assertEquals(List.of("00_Initial", "01_Inspection_100Cycles", "02_Incident", "99_Final"), list(absolute(folder + "\\02_Evidences")));
        Map<String, Object> incidentRecord = descriptor(absolute(folder + "\\02_Evidences\\02_Incident"));
        Map<?, ?> firstPhoto = (Map<?, ?>) ((List<?>) incidentRecord.get("photos")).get(0);
        assertEquals("test", firstPhoto.get("dateSource"));
        assertEquals("261008_Evidence_01.jpg", firstPhoto.get("savedName"));

        // The saved state lists the workbook, the metadata file and every evidence folder with its photos.
        TestAtlasTestStateDto state = service.testState("70010", "Volvo", "DV", "77");
        assertTrue(state.metadataExists());
        assertEquals(List.of("00_Initial", "01_Inspection_100Cycles", "02_Incident", "99_Final"),
                state.evidence().stream().map(SavedEvidenceDto::folder).toList());
        SavedEvidenceDto savedIncident = state.evidence().get(2);
        assertEquals("incident", savedIncident.type());
        assertEquals("261008_Evidence_01.jpg", savedIncident.photos().get(0).name());
        assertTrue(savedIncident.photos().get(0).preview());
        var image = service.evidencePhoto("70010", "Volvo", "DV", "77", "02_Incident", "261008_Evidence_01.jpg");
        assertEquals("image/jpeg", image.contentType());
        assertArrayEquals(BYTES, Files.readAllBytes(image.path()));
        assertFails(() -> service.evidencePhoto("70010", "Volvo", "DV", "77", "02_Incident", "evidence.json"), 404, "Not found");
        assertFails(() -> service.evidencePhoto("70010", "Volvo", "DV", "77", "..", "x.jpg"), 400, "valid");

        // Omitting a saved checkpoint is refused, so no folder can be overwritten.
        List<EvidenceSet> savedSets = state.evidence().subList(1, 3).stream()
                .map(e -> evidence(e.type(), e.title(), List.of(), "", e.referenceType(), e.referenceValue(), e.folder()))
                .toList();
        EvidenceSet savedInspection = savedSets.get(0);
        EvidenceSet savedIncidentSet = savedSets.get(1);
        ClimRequest omitted = base77();
        omitted.evidenceSets.addAll(List.of(evidence("initial", "Initial"), savedIncidentSet, evidence("final", "Final")));
        assertFails(() -> plan(omitted.build()), 409, "changed in the repository");

        // Swap the two checkpoints, add a photo to the moved one, a new checkpoint between them,
        // and replace test_metadata.json (reported as a conflict).
        EvidenceSet movedIncident = withFiles(savedIncidentSet, List.of(photo("c.jpg", "2026-10-08T12:00:00", "metadata")));
        EvidenceSet restart = evidence("restart", "Restart");
        FileEntry metadata2 = new FileEntry(UUID.randomUUID().toString(), metadata.name(), metadata.category(), metadata.size(), metadata.mime(), null, null);
        ClimRequest reorderedRequest = base77();
        reorderedRequest.files.add(metadata2);
        reorderedRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial"), movedIncident, restart, savedInspection, evidence("final", "Final")));
        TestAtlasPlan reordered = plan(reorderedRequest.build());
        List<List<String>> renamed = reordered.renames().stream()
                .map(item -> List.of(item.from().getLast(), item.to().getLast()))
                .sorted((x, y) -> x.get(0).compareTo(y.get(0)))
                .toList();
        assertEquals(List.of(List.of("01_Inspection_100Cycles", "03_Inspection_100Cycles"), List.of("02_Incident", "01_Incident")), renamed);
        assertTrue(reordered.files().stream().anyMatch(f -> f.relative().equals(folder + "\\02_Evidences\\01_Incident\\261008_Evidence_02.jpg")));
        PlannedFile metadataConflict = reordered.files().stream().filter(f -> f.category().equals("metadata")).findFirst().orElseThrow();
        assertTrue(metadataConflict.conflict());
        assertFails(() -> commit(reorderedRequest.build(), stage(reordered, json), List.of()), 409, "replace");
        commit(reorderedRequest.build(), stage(reordered, json), List.of(metadataConflict.id()));
        assertEquals(List.of("00_Initial", "01_Incident", "02_Restart", "03_Inspection_100Cycles", "99_Final"), list(absolute(folder + "\\02_Evidences")));
        assertEquals(List.of("261008_Evidence_01.jpg", "261008_Evidence_02.jpg", "evidence.json"), list(absolute(folder + "\\02_Evidences\\01_Incident")));
        assertTrue(list(absolute(folder + "\\02_Evidences\\03_Inspection_100Cycles")).contains("261008_Evidence_01.jpg"));
        Map<String, Object> merged = descriptor(absolute(folder + "\\02_Evidences\\01_Incident"));
        assertEquals(List.of("261008_Evidence_01.jpg", "261008_Evidence_02.jpg"),
                ((List<?>) merged.get("photos")).stream().map(p -> ((Map<?, ?>) p).get("savedName")).toList());
        assertEquals("01_Incident", merged.get("folder"));
        assertEquals(1, merged.get("sequence"));
        assertEquals(List.of(), list(absolute(folder)).stream().filter(name -> name.startsWith(".")).toList());

        // Two checkpoints of the same kind can swap places without a name collision.
        List<EvidenceSet> after = service.testState("70010", "Volvo", "DV", "77").evidence().subList(1, 4).stream()
                .map(e -> evidence(e.type(), e.title(), List.of(), "", e.referenceType(), e.referenceValue(), e.folder()))
                .toList();
        ClimRequest swappedRequest = base77();
        swappedRequest.evidenceSets.addAll(List.of(evidence("initial", "Initial"), after.get(2), after.get(1), after.get(0), evidence("final", "Final")));
        TestAtlasPlan swapped = plan(swappedRequest.build());
        commit(swappedRequest.build(), stage(swapped), List.of());
        assertEquals(List.of("00_Initial", "01_Inspection_100Cycles", "02_Restart", "03_Incident", "99_Final"), list(absolute(folder + "\\02_Evidences")));
    }

    @Test
    void reportsOneProgressEventPerStepAndRejectsUnknownWorkflows() {
        // Not in the original suite (Test Atlas reported bytes uploaded); this pins the
        // Toolbox progress contract: a 0/N baseline, then one event per step, ending at N/N.
        // Steps = review + repository check + one per folder + one per evidence.json + one per file.
        List<String> messages = new ArrayList<>();
        VibRequest request = vibration("0000");
        TestAtlasPlan p = plan(request.build());
        // batch, test, sample, 01_Inputs, 02_Evidences, 00_Initial, 99_Final, 01_Results,
        // 02_Characterization, 03_CANoe, 04_Report
        assertEquals(11, p.directories().size());
        assertEquals(2, p.files().size());       // batch and sample inputs workbooks
        assertEquals(0, p.evidenceSets().size());
        Conf_TestAtlas config = withUpload(request.build(), stage(p), List.of());
        strategy.execute(config, (current, total, message) -> messages.add(current + "/" + total + " " + message));

        int total = 2 + p.directories().size() + p.evidenceSets().size() + p.files().size();
        List<String> expected = new ArrayList<>();
        expected.add("0/2 Checking the repository"); // before the plan exists only the two fixed steps are known
        expected.add("1/" + total + " Reviewed " + p.folder());
        expected.add("2/" + total + " Checked the repository");
        int current = 2;
        for (List<String> directory : p.directories()) {
            expected.add(++current + "/" + total + " Created " + TestAtlasNames.join(directory));
        }
        for (PlannedFile file : p.files()) {
            expected.add(++current + "/" + total + " Saved " + file.relative());
        }
        assertEquals(15, total);
        assertEquals(16, messages.size());
        assertEquals(expected, messages);

        Conf_TestAtlas unknown = new Conf_TestAtlas("egr", "1", "X", "DV", null, null, null, null, null, null, null, null, null);
        assertFails(() -> planner.plan(unknown), 400, "climatic or vibration");
        assertEquals("TEST_ATLAS", strategy.getAlgorithm());
        assertEquals("1.0", strategy.getVersion());
    }

    @Test
    void repositoryRootIsServerConfigurationAndSavesCannotEscapeIt() throws IOException {
        // Portable part of "repository can be changed from the app, is remembered, and old
        // reviews cannot save to it": the Toolbox has no change endpoint (the root is the
        // testatlas.repository-root property), so what remains is that every review and
        // save is bound to that root, destinations cannot escape it and an unusable root
        // is detected. The same climatic fixture as the original test is used.
        assertEquals(repositoryDir.toAbsolutePath().normalize(), repository.root());
        ClimRequest climatic = climatic("11111", "Repo", "DV", "1", "261013");
        climatic.files.add(file("in.xlsx", "inputs"));
        climatic.evidenceSets.addAll(List.of(evidence("initial", "Initial"), evidence("final", "Final")));

        assertEquals(repository.root().toString(), service.plan(climatic.build()).root());
        assertFails(() -> repository.destination(List.of("..", "outside")), 400, "Invalid destination");
        assertFails(() -> repository.destination(List.of("11111 - Repo", "..", "..", "outside")), 400, "Invalid destination");

        Out_TestAtlas saved = commit(climatic.build(), stage(plan(climatic.build())), List.of());
        assertEquals(repositoryDir.resolve(Path.of("11111 - Repo", "DV", "TEST - 1")).toString(), saved.folderPath());
        assertEquals(List.of("11111 - Repo"), list(repositoryDir));

        // A root that is a file, like the original's "not-a-folder.txt", cannot be used.
        Path notAFolder = Files.writeString(stagingDir.resolve("not-a-folder.txt"), "x");
        TestAtlasRepository broken = new TestAtlasRepository(notAFolder.toString());
        assertThrows(java.io.UncheckedIOException.class, broken::ensureWritable);
        repository.ensureWritable();
        assertEquals(List.of("11111 - Repo"), list(repositoryDir)); // the write probe leaves nothing behind
    }

    // -------------------------------------------------------------------- helpers

    private TestAtlasPlan plan(Conf_TestAtlas request) {
        return planner.plan(request);
    }

    private String stage(TestAtlasPlan plan) {
        return stage(plan, BYTES);
    }

    /** Stage every reviewed file; {@code metadataContent} is used for test_metadata.json. */
    private String stage(TestAtlasPlan plan, byte[] metadataContent) {
        String id = staging.create(plan);
        for (PlannedFile file : plan.files()) {
            byte[] content = file.category().equals("metadata") ? metadataContent : BYTES;
            staging.store(id, file.id(), new ByteArrayInputStream(content));
        }
        return id;
    }

    private Out_TestAtlas commit(Conf_TestAtlas request, String uploadId, List<String> overwrite) {
        return strategy.execute(withUpload(request, uploadId, overwrite), I_ProgressListener.NOOP);
    }

    private static Conf_TestAtlas withUpload(Conf_TestAtlas c, String uploadId, List<String> overwrite) {
        return new Conf_TestAtlas(c.testType(), c.programNumber(), c.programName(), c.phase(), c.testNumber(), c.date(),
                c.files(), c.evidenceSets(), c.batchName(), c.inputsWorkbook(), c.tests(), uploadId, overwrite);
    }

    private static List<String> conflicts(TestAtlasPlan plan) {
        return plan.files().stream().filter(PlannedFile::conflict).map(PlannedFile::id).toList();
    }

    private Path absolute(String relative) {
        Path path = repositoryDir;
        for (String part : relative.split("\\\\")) {
            path = path.resolve(part);
        }
        return path;
    }

    private static List<String> list(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.map(path -> path.getFileName().toString()).sorted().toList();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> descriptor(Path directory) throws IOException {
        return mapper.readValue(Files.readString(directory.resolve("evidence.json")), Map.class);
    }

    /** The save is refused by the planner (400) or by the commit checks (409); nothing is written. */
    private static void assertBlocked(Executable executable, String regex) {
        TestAtlasException failure = assertThrows(TestAtlasException.class, executable);
        assertTrue(failure.status() == 400 || failure.status() == 409, failure.getMessage());
        assertTrue(Pattern.compile(regex).matcher(failure.getMessage()).find(), failure.getMessage());
    }

    private static void assertFails(Executable executable, int status, String regex) {
        TestAtlasException failure = assertThrows(TestAtlasException.class, executable);
        assertEquals(status, failure.status(), failure.getMessage());
        assertTrue(Pattern.compile(regex).matcher(failure.getMessage()).find(), failure.getMessage());
    }

    private static FileEntry upload(String name) {
        return upload(name, "");
    }

    private static FileEntry upload(String name, String mime) {
        return new FileEntry(UUID.randomUUID().toString(), name, null, (long) BYTES.length, mime, null, null);
    }

    private static FileEntry file(String name, String category) {
        return new FileEntry(UUID.randomUUID().toString(), name, category, (long) BYTES.length, "", null, null);
    }

    private static FileEntry photo(String name, String captureDate, String dateSource) {
        return new FileEntry(UUID.randomUUID().toString(), name, null, (long) BYTES.length, "image/jpeg", captureDate, dateSource);
    }

    private static EvidenceSet evidence(String type, String title) {
        return evidence(type, title, List.of(), "");
    }

    private static EvidenceSet evidence(String type, String title, List<FileEntry> files, String notes) {
        return evidence(type, title, files, notes, "none", "", null);
    }

    private static EvidenceSet evidence(String type, String title, List<FileEntry> files, String notes,
            String referenceType, String referenceValue, String existingFolder) {
        return new EvidenceSet(UUID.randomUUID().toString(), type, title, referenceType, referenceValue, notes, existingFolder, files);
    }

    private static EvidenceSet withFiles(EvidenceSet set, List<FileEntry> files) {
        return new EvidenceSet(set.id(), set.type(), set.title(), set.referenceType(), set.referenceValue(), set.notes(), set.existingFolder(), files);
    }

    private static List<EvidenceSet> sets() {
        return List.of(evidence("initial", "Initial condition"), evidence("final", "Final condition"));
    }

    private static ClimRequest climatic(String programNumber, String programName, String phase, String testNumber, String date) {
        return new ClimRequest(programNumber, programName, phase, testNumber, date);
    }

    private static ClimRequest base512() {
        return climatic("90001", "Audi", "PV", "512", "261006");
    }

    private static ClimRequest base77() {
        return climatic("70010", "Volvo", "DV", "77", "261008");
    }

    private static VibRequest vibration(String programNumber) {
        return new VibRequest(programNumber);
    }

    private static VibSample sample(String code) {
        return new VibSample(code);
    }

    private static List<String> sampleParts(VibRequest r) {
        VibTest t = r.tests.get(0);
        return List.of(r.programNumber + " - " + r.programName, r.phase, "BATCH - " + r.batchName,
                "TEST - " + t.testCode + " - " + t.testType + " - " + t.axis,
                "MM - " + t.materialMasters.get(0).materialMasterCode);
    }

    /** Mutable climatic manifest, mirroring the JavaScript fixture objects. */
    private static final class ClimRequest {
        final String programNumber;
        final String programName;
        final String phase;
        final String testNumber;
        final String date;
        final List<FileEntry> files = new ArrayList<>();
        final List<EvidenceSet> evidenceSets = new ArrayList<>();

        ClimRequest(String programNumber, String programName, String phase, String testNumber, String date) {
            this.programNumber = programNumber;
            this.programName = programName;
            this.phase = phase;
            this.testNumber = testNumber;
            this.date = date;
        }

        Conf_TestAtlas build() {
            return new Conf_TestAtlas("climatic", programNumber, programName, phase, testNumber, date,
                    List.copyOf(files), List.copyOf(evidenceSets), null, null, null, null, null);
        }
    }

    /** Mutable vibration manifest, mirroring the JavaScript fixture objects. */
    private static final class VibRequest {
        final String programNumber;
        final String programName = "Ejemplo";
        final String phase = "DV";
        final String batchName = "01 - Validacion";
        String date = "260501";
        FileEntry inputsWorkbook = upload("HojaInputs.xlsm");
        final List<VibTest> tests = new ArrayList<>();
        boolean nullTest;

        VibRequest(String programNumber) {
            this.programNumber = programNumber;
            tests.add(new VibTest("IN260501-01", "FSweep", "Z"));
        }

        Conf_TestAtlas build() {
            List<VibrationTest> built = new ArrayList<>();
            if (nullTest) {
                built.add(null);
            } else {
                tests.forEach(test -> built.add(test.build()));
            }
            return new Conf_TestAtlas("vibration", programNumber, programName, phase, null, date, null, null,
                    batchName, inputsWorkbook, built, null, null);
        }
    }

    private static final class VibTest {
        final String id = UUID.randomUUID().toString();
        final String testCode;
        final String testType;
        final String axis;
        List<VibSample> materialMasters = new ArrayList<>();
        boolean nullSample;

        VibTest(String testCode, String testType, String axis) {
            this.testCode = testCode;
            this.testType = testType;
            this.axis = axis;
            materialMasters.add(new VibSample("ABC12345"));
        }

        VibrationTest build() {
            List<MaterialMaster> built = new ArrayList<>();
            if (nullSample) {
                built.add(null);
            } else {
                materialMasters.forEach(sample -> built.add(sample.build()));
            }
            return new VibrationTest(id, testCode, testType, axis, built);
        }
    }

    private static final class VibSample {
        final String id = UUID.randomUUID().toString();
        String materialMasterCode;
        FileEntry inputsWorkbook = upload("SampleInputs.xlsm");
        String existingWorkbook = "";
        final List<EvidenceSet> evidenceSets = new ArrayList<>(sets());
        final List<FileEntry> results = new ArrayList<>();
        final List<FileEntry> characterization = new ArrayList<>();
        final List<FileEntry> canoe = new ArrayList<>();
        FileEntry metadata;

        VibSample(String materialMasterCode) {
            this.materialMasterCode = materialMasterCode;
        }

        MaterialMaster build() {
            return new MaterialMaster(id, materialMasterCode, inputsWorkbook, existingWorkbook,
                    List.copyOf(evidenceSets), List.copyOf(results), List.copyOf(characterization),
                    List.copyOf(canoe), metadata);
        }
    }
}
