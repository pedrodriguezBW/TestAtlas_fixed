package com.borgwarner.testatlas.algorithm.impl.testatlas;

import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.DATE_SOURCES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.EVIDENCE_FOLDER;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.EVIDENCE_TYPES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.EVIDENCE_TYPE_BY_NAME;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.IMAGE_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.METADATA_FILE;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.PREVIEW_TYPES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.REFERENCE_TYPES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.WORKBOOK_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.extension;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.lower;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.originalName;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.safePart;

import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto;
import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto.ProgramSuggestionDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto.SavedEvidenceDto;
import com.borgwarner.testatlas.dto.TestAtlasTestStateDto.SavedPhotoDto;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Read-only views of the project repository used by the Test Atlas form:
 * suggestions, workbooks already saved, the state of a climatic test and its
 * evidence photos. Nothing here writes to the repository.
 */
@Component
public class TestAtlasRepositoryReader {

    private static final Pattern CLIMATIC_TEST_PREFIX = Pattern.compile("^TEST - ", Pattern.CASE_INSENSITIVE);
    private static final Comparator<String> NAME_ORDER =
            String.CASE_INSENSITIVE_ORDER.thenComparing(Comparator.naturalOrder());

    private final TestAtlasRepository repository;
    private final ObjectMapper mapper;

    public TestAtlasRepositoryReader(TestAtlasRepository repository, ObjectMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    /** One saved evidence photo served as a thumbnail. */
    public record EvidencePhoto(Path path, String contentType) {
    }

    /** Test folder from the program, phase and test number of a climatic request. */
    public static List<String> climaticBase(String programNumber, String programName, String phase, String testNumber) {
        return List.of(
                safePart(programNumber, "programNumber") + " - " + safePart(programName, "programName"),
                safePart(phase, "phase"),
                "TEST - " + safePart(testNumber, "testNumber"));
    }

    /** List the inputs workbooks already stored in a test's 01_Inputs folder. */
    public List<String> existingInputWorkbooks(List<String> inputsParts) {
        Path folder = repository.destination(inputsParts);
        repository.ensureNotLink(folder);
        return repository.entries(folder).stream()
                .filter(Files::isRegularFile)
                .map(entry -> entry.getFileName().toString())
                .filter(name -> WORKBOOK_EXTENSIONS.contains(extension(name)))
                .sorted(NAME_ORDER)
                .toList();
    }

    /** Read a checkpoint's evidence.json, or null when it is missing or invalid. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> readEvidenceDescriptor(Path directory) {
        try {
            Object value = mapper.readValue(Files.readString(directory.resolve("evidence.json")), Object.class);
            return value instanceof Map<?, ?> map ? (Map<String, Object>) map : null;
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    /**
     * Describe every saved evidence folder of a test, in folder order: its type,
     * title, reference and notes (from evidence.json when available) and the
     * photos it contains.
     */
    public List<SavedEvidenceDto> readSavedEvidence(List<String> base) {
        Path root = repository.destination(append(base, "02_Evidences"));
        repository.ensureNotLink(root);

        List<String> folders = repository.entries(root).stream()
                .filter(Files::isDirectory)
                .map(entry -> entry.getFileName().toString())
                .filter(name -> EVIDENCE_FOLDER.matcher(name).matches())
                .sorted(NAME_ORDER)
                .toList();

        List<SavedEvidenceDto> result = new ArrayList<>();
        for (String folder : folders) {
            Path directory = root.resolve(folder);
            repository.ensureNotLink(directory);

            Map<String, Object> descriptor = readEvidenceDescriptor(directory);
            if (descriptor == null) {
                descriptor = Map.of();
            }
            Map<String, Map<?, ?>> recorded = new HashMap<>();
            if (descriptor.get("photos") instanceof List<?> photos) {
                for (Object photo : photos) {
                    if (photo instanceof Map<?, ?> photoRecord && photoRecord.get("savedName") instanceof String savedName) {
                        recorded.put(lower(savedName), photoRecord);
                    }
                }
            }

            String lowerFolder = lower(folder);
            String type = lowerFolder.equals("00_initial") ? "initial" : lowerFolder.equals("99_final") ? "final" : "";
            if (type.isEmpty()) {
                String fromFile = descriptor.get("type") instanceof String declared && EVIDENCE_TYPES.contains(declared)
                        ? declared : "";
                String fromName = EVIDENCE_TYPE_BY_NAME.getOrDefault(
                        lower(folder.substring(3).split("_")[0]), "other");
                type = !fromFile.isEmpty() && !fromFile.equals("initial") && !fromFile.equals("final")
                        ? fromFile : fromName;
            }

            Map<?, ?> reference = descriptor.get("reference") instanceof Map<?, ?> map ? map : Map.of();
            Object referenceValue = reference.get("value");
            boolean hasReferenceValue = referenceValue != null && !String.valueOf(referenceValue).isEmpty()
                    && !(referenceValue instanceof Boolean flag && !flag)
                    && !(referenceValue instanceof Number number && number.doubleValue() == 0);
            String referenceType = reference.get("type") instanceof String declared
                    && REFERENCE_TYPES.contains(declared) && hasReferenceValue ? declared : "none";
            boolean titleOk = descriptor.get("title") instanceof String title
                    && !title.isBlank() && title.length() <= 90;

            List<SavedPhotoDto> photos = new ArrayList<>();
            for (Path entry : repository.entries(directory)) {
                String name = entry.getFileName().toString();
                if (!Files.isRegularFile(entry) || !IMAGE_EXTENSIONS.contains(extension(name))) {
                    continue;
                }
                Map<?, ?> photoRecord = recorded.getOrDefault(lower(name), Map.of());
                photos.add(new SavedPhotoDto(
                        name,
                        photoRecord.get("originalName") instanceof String original ? original : "",
                        size(entry),
                        photoRecord.get("captureDate") instanceof String captureDate ? captureDate : "",
                        photoRecord.get("dateSource") instanceof String source && DATE_SOURCES.contains(source) ? source : "",
                        PREVIEW_TYPES.containsKey(extension(name))));
            }
            photos.sort(Comparator.comparing(SavedPhotoDto::name, NAME_ORDER));

            String notes = descriptor.get("notes") instanceof String text ? text : "";
            result.add(new SavedEvidenceDto(
                    folder,
                    type,
                    titleOk ? ((String) descriptor.get("title")).strip() : folder,
                    referenceType,
                    referenceType.equals("none") ? "" : truncate(String.valueOf(referenceValue), 50),
                    truncate(notes, 500),
                    List.copyOf(photos)));
        }
        return List.copyOf(result);
    }

    /** Everything already saved for a climatic test. */
    public TestAtlasTestStateDto testState(List<String> base) {
        Path metadata = repository.destination(append(append(base, "04_Report"), METADATA_FILE));
        repository.ensureNotLink(metadata);
        return new TestAtlasTestStateDto(
                existingInputWorkbooks(append(base, "01_Inputs")),
                repository.exists(metadata),
                readSavedEvidence(base));
    }

    /** Locate one saved evidence photo so the app can show it as a thumbnail. */
    public EvidencePhoto evidencePhoto(List<String> base, String folder, String name) {
        String safeFolder = safePart(folder, "evidence folder", 120);
        if (!EVIDENCE_FOLDER.matcher(safeFolder).matches()) {
            throw new TestAtlasException("Not found.", 404);
        }
        String safeName = originalName(name, true, 255);
        String type = PREVIEW_TYPES.get(extension(safeName));
        if (type == null) {
            throw new TestAtlasException("Not found.", 404);
        }
        Path target = repository.destination(append(append(append(base, "02_Evidences"), safeFolder), safeName));
        repository.ensureNotLink(target);
        if (!repository.exists(target) || !repository.isFile(target)) {
            throw new TestAtlasException("Not found.", 404);
        }
        return new EvidencePhoto(target, type);
    }

    /**
     * Suggestions derived from folders already present in the repository.
     * {@code testType} selects the climatic ({@code "Program - Name"} folders)
     * or vibration ({@code "Program_Name"} folders) naming.
     */
    public TestAtlasSuggestionsDto suggestions(String testType, String query, String program, String phase) {
        String q = query == null ? "" : lower(query);
        if ("vibration".equals(testType)) {
            return vibrationSuggestions(q, program, phase);
        }
        List<ProgramSuggestionDto> programs = new ArrayList<>();
        for (Path entry : repository.entries(repository.root())) {
            String name = entry.getFileName().toString();
            if (!Files.isDirectory(entry) || !name.contains(" - ")) {
                continue;
            }
            int index = name.indexOf(" - ");
            ProgramSuggestionDto suggestion = new ProgramSuggestionDto(
                    name.substring(0, index), name.substring(index + 3), name);
            if (lower(suggestion.number() + " " + suggestion.name()).contains(q) && programs.size() < 30) {
                programs.add(suggestion);
            }
        }
        List<String> phases = new ArrayList<>();
        List<String> tests = new ArrayList<>();
        if (program != null && !program.isEmpty()) {
            String programFolder = safePart(program, "program");
            Path programPath = repository.destination(List.of(programFolder));
            phases = directoryNames(programPath);
            List<String> phaseNames = phase != null && !phase.isEmpty()
                    ? List.of(safePart(phase, "phase")) : phases;
            Set<String> found = new LinkedHashSet<>();
            for (String phaseName : phaseNames) {
                for (Path entry : repository.entries(repository.destination(List.of(programFolder, phaseName)))) {
                    String name = entry.getFileName().toString();
                    if (Files.isDirectory(entry) && CLIMATIC_TEST_PREFIX.matcher(name).find()) {
                        found.add(CLIMATIC_TEST_PREFIX.matcher(name).replaceFirst(""));
                    }
                }
            }
            tests = found.stream().filter(name -> lower(name).contains(q)).limit(30).toList();
        }
        return new TestAtlasSuggestionsDto(List.copyOf(programs), List.copyOf(phases), List.copyOf(tests), List.of());
    }

    private TestAtlasSuggestionsDto vibrationSuggestions(String q, String program, String phase) {
        List<ProgramSuggestionDto> programs = new ArrayList<>();
        for (Path entry : repository.entries(repository.root())) {
            String name = entry.getFileName().toString();
            if (!Files.isDirectory(entry) || !name.contains("_")) {
                continue;
            }
            int index = name.indexOf('_');
            ProgramSuggestionDto suggestion = new ProgramSuggestionDto(
                    name.substring(0, index), name.substring(index + 1), name);
            if (lower(suggestion.number() + " " + suggestion.name()).contains(q) && programs.size() < 30) {
                programs.add(suggestion);
            }
        }
        List<String> phases = List.of();
        List<String> batches = List.of();
        if (program != null && !program.isEmpty()) {
            List<String> parts = new ArrayList<>();
            parts.add(safePart(program, "program folder", 255));
            repository.ensureNotLink(repository.destination(parts));
            phases = directoryNames(repository.destination(parts));
            if (phase != null && !phase.isEmpty()) {
                parts.add(safePart(phase, "phase"));
                repository.ensureNotLink(repository.destination(parts));
                batches = directoryNames(repository.destination(parts));
            }
        }
        return new TestAtlasSuggestionsDto(List.copyOf(programs), phases, List.of(), batches);
    }

    /** Inputs workbooks detected directly in a vibration sample folder. */
    public List<String> sampleInputs(
            String programNumber, String programName, String phase, String batchName,
            String testCode, String testType, String axis, String materialMasterCode) {
        List<String> parts = List.of(
                safePart(programNumber, "programNumber") + "_" + safePart(programName, "programName"),
                safePart(phase, "phase"),
                safePart(batchName, "batchName"),
                safePart(testCode, "testCode") + "_" + safePart(testType, "testType") + "_" + safePart(axis, "axis"),
                safePart(materialMasterCode, "materialMasterCode"));
        Path folder = repository.destination(parts);
        repository.ensureNotLink(folder);
        return repository.entries(folder).stream()
                .filter(Files::isRegularFile)
                .map(entry -> entry.getFileName().toString())
                .filter(name -> WORKBOOK_EXTENSIONS.contains(extension(name)))
                .toList();
    }

    private List<String> directoryNames(Path directory) {
        return repository.entries(directory).stream()
                .filter(Files::isDirectory)
                .map(entry -> entry.getFileName().toString())
                .toList();
    }

    private static long size(Path file) {
        try {
            return Files.size(file);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private static String truncate(String value, int length) {
        return value.length() <= length ? value : value.substring(0, length);
    }

    static List<String> append(List<String> parts, String part) {
        List<String> result = new ArrayList<>(parts);
        result.add(part);
        return List.copyOf(result);
    }
}
