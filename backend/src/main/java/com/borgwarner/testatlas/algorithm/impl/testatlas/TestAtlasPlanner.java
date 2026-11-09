package com.borgwarner.testatlas.algorithm.impl.testatlas;

import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.CANOE_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.DATE_SOURCES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.EVIDENCE_FOLDER;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.EVIDENCE_TYPES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.FIXED_EVIDENCE_FOLDERS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.IMAGE_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.MAX_FILES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.METADATA_FILE;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.METADATA_MAX_BYTES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.REFERENCE_TYPES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.VIBRATION_IMAGE_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.WORKBOOK_EXTENSIONS;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.cleanOptionalText;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.dateCode;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.evidenceFolderName;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.extension;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.fileCategory;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.isSimpatiExtension;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.join;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.lower;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.originalName;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.safePart;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.split;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.validateDate;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.validateFileSize;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.validateIdentifier;

import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.EvidenceSet;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.FileEntry;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.MaterialMaster;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas.VibrationTest;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedEvidence;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedFile;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.Rename;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Converts a browser manifest into a complete, validated save plan. This is the
 * Java translation of {@code buildPlan} (climatic) and {@code buildVibrationPlan}
 * (vibration) of the original Test Atlas: it calculates names, folders and
 * conflicts but never writes files, so the user can review the exact result
 * before saving.
 */
@Component
public class TestAtlasPlanner {

    private static final Pattern SAVED_EVIDENCE_PHOTO = Pattern.compile(
            "^\\d{6}_Evidence_(\\d+)\\.[^.]+$", Pattern.CASE_INSENSITIVE);

    private final TestAtlasRepository repository;
    private final TestAtlasRepositoryReader reader;

    public TestAtlasPlanner(TestAtlasRepository repository, TestAtlasRepositoryReader reader) {
        this.repository = repository;
        this.reader = reader;
    }

    public TestAtlasPlan plan(Conf_TestAtlas request) {
        if ("vibration".equals(request.testType())) {
            return planVibration(request);
        }
        if (!"climatic".equals(request.testType())) {
            throw new TestAtlasException("Select an available climatic or vibration workflow.");
        }
        return planClimatic(request);
    }

    // ---------------------------------------------------------------- climatic

    private TestAtlasPlan planClimatic(Conf_TestAtlas request) {
        /* 1. Validate test metadata. */
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("testNumber", safePart(request.testNumber(), "test number"));
        fields.put("programNumber", safePart(request.programNumber(), "program number"));
        fields.put("programName", safePart(request.programName(), "program name"));
        fields.put("phase", safePart(request.phase(), "phase"));
        fields.put("date", validateDate(request.date()));

        /* 2. Build the standard test paths. */
        String program = fields.get("programNumber") + " - " + fields.get("programName");
        String test = "TEST - " + fields.get("testNumber");
        List<String> base = List.of(program, fields.get("phase"), test);

        Map<String, List<String>> paths = new LinkedHashMap<>();
        paths.put("inputs", with(base, "01_Inputs"));
        paths.put("evidences", with(base, "02_Evidences"));
        paths.put("simpati", with(with(base, "03_Data"), "01_SIMPATI"));
        paths.put("graphtec", with(with(base, "03_Data"), "02_Graphtec"));
        paths.put("canoe", with(with(base, "03_Data"), "03_CANoe"));
        paths.put("metadata", with(base, "04_Report"));

        /* 3. Validate standard files. The list may be empty when the test already
         * has an inputs workbook and only evidence photos are being added. */
        if (request.files() == null) {
            throw new TestAtlasException("Invalid file list.");
        }
        List<DraftFile> files = new ArrayList<>();
        int order = 0;
        for (FileEntry raw : request.files()) {
            if (raw == null) {
                throw new TestAtlasException("Invalid file list.");
            }
            DraftFile file = new DraftFile();
            file.id = validateIdentifier(raw.id(), "file identifier");
            file.name = originalName(raw.name());
            file.category = fileCategory(raw.category());
            String fileExtension = extension(file.name);
            file.size = validateFileSize(raw.size(), file.name);

            if (file.category.equals("inputs") && !WORKBOOK_EXTENSIONS.contains(fileExtension)) {
                throw new TestAtlasException("The inputs file must be .xlsx or .xlsm.");
            }
            if (file.category.equals("simpati") && !isSimpatiExtension(fileExtension)) {
                throw new TestAtlasException(file.name + ": unsupported SIMPATI format. Use archives .x01\u2013.x99 "
                        + "or programs .p01\u2013.p99 / .b01\u2013.b99.");
            }
            if (file.category.equals("canoe") && !CANOE_EXTENSIONS.contains(fileExtension)) {
                throw new TestAtlasException(file.name
                        + ": CANoe accepts .blf, .asc, .mf4, .mdf, .pcap and .pcapng logging files.");
            }
            if (file.category.equals("metadata")) {
                if (!file.name.equals(METADATA_FILE)) {
                    throw new TestAtlasException("The metadata file must be named exactly " + METADATA_FILE + ".");
                }
                if (file.size > METADATA_MAX_BYTES) {
                    throw new TestAtlasException(METADATA_FILE + " is larger than 10 MB.");
                }
            }
            file.mime = raw.mime() == null ? "" : raw.mime();
            file.order = order++;
            file.targetParts = paths.get(file.category);
            files.add(file);
        }

        /* The inputs workbook is mandatory for a new test. When the test folder
         * already contains one in 01_Inputs, uploading another is optional and
         * the existing workbook is kept untouched. */
        long uploadedInputs = files.stream().filter(file -> file.category.equals("inputs")).count();
        if (uploadedInputs > 1) {
            throw new TestAtlasException("Add only one inputs Excel file.");
        }
        if (files.stream().filter(file -> file.category.equals("metadata")).count() > 1) {
            throw new TestAtlasException("Add only one " + METADATA_FILE + " file.");
        }
        List<String> existingInputs = reader.existingInputWorkbooks(paths.get("inputs"));
        if (uploadedInputs == 0 && existingInputs.isEmpty()) {
            throw new TestAtlasException(
                    "Add the inputs Excel file. No inputs workbook was found for this test yet.");
        }
        List<List<String>> existingWorkbooks = uploadedInputs == 0
                ? existingInputs.stream().map(name -> with(paths.get("inputs"), name)).toList()
                : List.of();

        /* 4. Validate evidence sets. */
        if (request.evidenceSets() == null) {
            throw new TestAtlasException("Invalid evidence collection.");
        }
        if (request.evidenceSets().size() > 100) {
            throw new TestAtlasException("Too many evidence checkpoints.");
        }
        List<DraftEvidence> evidenceSets = new ArrayList<>();
        int position = 0;
        for (EvidenceSet raw : request.evidenceSets()) {
            if (raw == null) {
                throw new TestAtlasException("Invalid evidence collection.");
            }
            DraftEvidence evidence = new DraftEvidence();
            evidence.id = validateIdentifier(raw.id(), "evidence identifier");
            evidence.type = raw.type() == null ? "" : raw.type();
            if (!EVIDENCE_TYPES.contains(evidence.type)) {
                throw new TestAtlasException("Invalid evidence type.");
            }
            evidence.referenceType = raw.referenceType() == null || raw.referenceType().isEmpty()
                    ? "none" : raw.referenceType();
            if (!REFERENCE_TYPES.contains(evidence.referenceType)) {
                throw new TestAtlasException("Invalid evidence reference type.");
            }
            evidence.referenceValue = cleanOptionalText(raw.referenceValue(), 50, "Evidence reference");
            if (!evidence.referenceType.equals("none") && evidence.referenceValue.isEmpty()) {
                throw new TestAtlasException("An evidence reference value is required.");
            }
            evidence.title = safePart(raw.title(), "evidence title");
            evidence.notes = cleanOptionalText(raw.notes(), 500, "Evidence notes");
            List<FileEntry> rawPhotos = raw.files() == null ? List.of() : raw.files();

            // A checkpoint that is already saved keeps its folder name; only its
            // two-digit position prefix changes when the order changes.
            evidence.existingFolder = "";
            if (raw.existingFolder() != null && !raw.existingFolder().isEmpty()
                    && !evidence.type.equals("initial") && !evidence.type.equals("final")) {
                evidence.existingFolder = safePart(raw.existingFolder(), "evidence folder", 120);
                if (!EVIDENCE_FOLDER.matcher(evidence.existingFolder).matches()
                        || FIXED_EVIDENCE_FOLDERS.contains(lower(evidence.existingFolder))) {
                    throw new TestAtlasException("Invalid saved evidence folder.");
                }
            }

            evidence.sequence = position;
            evidence.files = new ArrayList<>();
            int photoOrder = 0;
            for (FileEntry photo : rawPhotos) {
                evidence.files.add(validateEvidencePhoto(photo, photoOrder++));
            }

            evidence.folderName = evidence.existingFolder.isEmpty()
                    ? evidenceFolderName(evidence.type, evidence.referenceType, evidence.referenceValue, position)
                    : String.format("%02d", position) + evidence.existingFolder.substring(2);
            evidence.path = with(paths.get("evidences"), evidence.folderName);
            // Where the folder is on disk now (differs only when it is reordered).
            evidence.sourcePath = with(paths.get("evidences"),
                    evidence.existingFolder.isEmpty() ? evidence.folderName : evidence.existingFolder);
            evidenceSets.add(evidence);
            position++;
        }
        if (evidenceSets.size() > 99) {
            throw new TestAtlasException("Too many evidence checkpoints.");
        }

        /* 5. Require exactly one Initial and one Final set. */
        long initialSets = evidenceSets.stream().filter(evidence -> evidence.type.equals("initial")).count();
        long finalSets = evidenceSets.stream().filter(evidence -> evidence.type.equals("final")).count();
        if (initialSets != 1 || finalSets != 1) {
            throw new TestAtlasException("Exactly one Initial and one Final evidence set are required.");
        }
        if (!evidenceSets.getFirst().type.equals("initial") || !evidenceSets.getLast().type.equals("final")) {
            throw new TestAtlasException("Initial evidence must be first and Final evidence must be last.");
        }

        /* 5b. Every saved checkpoint folder must be part of the request. Otherwise
         * a reordered folder could take the name of one the app does not know
         * about. */
        Path evidencesDirectory = repository.destination(paths.get("evidences"));
        repository.ensureNotLink(evidencesDirectory);
        List<String> savedCheckpoints = repository.entries(evidencesDirectory).stream()
                .filter(Files::isDirectory)
                .map(entry -> entry.getFileName().toString())
                .filter(name -> EVIDENCE_FOLDER.matcher(name).matches() && !FIXED_EVIDENCE_FOLDERS.contains(lower(name)))
                .map(TestAtlasNames::lower)
                .toList();
        List<String> referenced = evidenceSets.stream()
                .filter(evidence -> !evidence.existingFolder.isEmpty())
                .map(evidence -> lower(evidence.existingFolder))
                .toList();
        if (new HashSet<>(referenced).size() != referenced.size()) {
            throw new TestAtlasException("The same saved evidence folder appears twice.");
        }
        boolean sameFolders = referenced.size() == savedCheckpoints.size()
                && savedCheckpoints.containsAll(referenced);
        if (!sameFolders) {
            throw new TestAtlasException("The evidence folders of this test changed in the repository. "
                    + "Open Test evidence again to reload them.", 409);
        }

        // Folders whose position changed are renamed when saving.
        List<Rename> renames = evidenceSets.stream()
                .filter(evidence -> !evidence.existingFolder.isEmpty()
                        && !evidence.existingFolder.equals(evidence.folderName))
                .map(evidence -> new Rename(evidence.sourcePath, evidence.path))
                .toList();

        /* 6. Convert the evidence photos into normal plan files. */
        for (DraftEvidence evidence : evidenceSets) {
            List<DraftFile> orderedPhotos = new ArrayList<>(evidence.files);
            orderedPhotos.sort(Comparator.comparing((DraftFile photo) -> photo.captureDate)
                    .thenComparingInt(photo -> photo.order));

            int nextNumber = 0;
            for (Path entry : repository.entries(repository.destination(evidence.sourcePath))) {
                Matcher match = SAVED_EVIDENCE_PHOTO.matcher(entry.getFileName().toString());
                if (match.matches()) {
                    nextNumber = Math.max(nextNumber, Integer.parseInt(match.group(1)));
                }
            }
            for (DraftFile photo : orderedPhotos) {
                photo.evidenceId = evidence.id;
                photo.targetParts = evidence.path;
                // Conflicts are checked where the folder is before any rename.
                photo.checkParts = evidence.sourcePath;
                photo.targetName = dateCode(photo.captureDate) + "_Evidence_"
                        + String.format("%02d", ++nextNumber) + extension(photo.name);
                files.add(photo);
            }
            evidence.files = orderedPhotos;
        }

        /* 7. Enforce global file limits after adding evidence photos. No new file
         * is required: a follow-up save may only add evidence checkpoints or
         * create the missing folders of an existing test. */
        if (files.size() > MAX_FILES) {
            throw new TestAtlasException("Add 1 to " + MAX_FILES + " files.");
        }
        Set<String> identifiers = new HashSet<>();
        for (DraftFile file : files) {
            if (!identifiers.add(file.id)) {
                throw new TestAtlasException("Duplicate file identifiers.");
            }
        }

        /* 8. Generate final names and relative destinations. */
        for (DraftFile file : files) {
            if (file.category.equals("inputs")) {
                file.targetName = fields.get("date") + "_CL_Inputs_" + fields.get("programName") + "_"
                        + fields.get("phase") + "_" + fields.get("testNumber") + extension(file.name);
            } else if (file.targetName == null) {
                file.targetName = file.name;
            }
            file.relative = join(with(file.targetParts, file.targetName));
            // Relative path of the destination as it is on disk before any folder
            // rename; used for conflict checks before saving.
            file.checkRelative = join(with(file.checkParts != null ? file.checkParts : file.targetParts, file.targetName));
            file.conflict = repository.exists(repository.destination(split(file.checkRelative)));
        }

        /* 9. Prevent duplicate Windows destinations. */
        Set<String> destinations = new HashSet<>();
        for (DraftFile file : files) {
            if (!destinations.add(lower(file.relative))) {
                throw new TestAtlasException(
                        "Two uploaded files would have the same destination: " + file.relative);
            }
        }

        /* 10. Every folder created on save, in display order. The review tree is
         * built from this list, so empty folders are shown too. */
        List<List<String>> directories = new ArrayList<>();
        directories.add(base);
        directories.add(paths.get("inputs"));
        directories.add(paths.get("evidences"));
        evidenceSets.forEach(evidence -> directories.add(evidence.path));
        directories.add(with(base, "03_Data"));
        directories.add(paths.get("simpati"));
        directories.add(paths.get("graphtec"));
        directories.add(paths.get("canoe"));
        directories.add(with(base, "04_Report"));

        // Each checkpoint folder also receives an evidence.json record.
        List<List<String>> generatedFiles = evidenceSets.stream()
                .map(evidence -> with(evidence.path, "evidence.json"))
                .toList();

        return new TestAtlasPlan(
                "climatic",
                Map.copyOf(fields),
                base,
                join(base),
                files.stream().map(DraftFile::toRecord).toList(),
                evidenceSets.stream().map(DraftEvidence::toRecord).toList(),
                renames,
                List.copyOf(directories),
                existingWorkbooks,
                generatedFiles);
    }

    private static DraftFile validateEvidencePhoto(FileEntry raw, int order) {
        if (raw == null) {
            throw new TestAtlasException("Invalid evidence photo.");
        }
        DraftFile photo = new DraftFile();
        photo.id = validateIdentifier(raw.id(), "evidence photo identifier");
        photo.name = originalName(raw.name());
        String fileExtension = extension(photo.name);
        photo.mime = raw.mime() == null ? "" : raw.mime();
        if (!IMAGE_EXTENSIONS.contains(fileExtension) && !photo.mime.startsWith("image/")) {
            throw new TestAtlasException("Unsupported photo format: " + photo.name + ".");
        }
        photo.size = validateFileSize(raw.size(), photo.name);
        photo.captureDate = raw.captureDate() == null ? "" : raw.captureDate();
        // dateCode performs the complete timestamp validation.
        dateCode(photo.captureDate);
        photo.dateSource = raw.dateSource() == null || raw.dateSource().isEmpty() ? "metadata" : raw.dateSource();
        if (!DATE_SOURCES.contains(photo.dateSource)) {
            throw new TestAtlasException("Invalid date source for " + photo.name + ".");
        }
        photo.category = "evidence";
        photo.order = order;
        return photo;
    }

    // --------------------------------------------------------------- vibration

    private TestAtlasPlan planVibration(Conf_TestAtlas request) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("programNumber", safePart(request.programNumber(), "programNumber"));
        fields.put("programName", safePart(request.programName(), "programName"));
        fields.put("phase", safePart(request.phase(), "phase"));
        fields.put("batchName", safePart(request.batchName(), "batchName"));

        List<String> base = List.of(
                joinName(List.of(fields.get("programNumber"), fields.get("programName")), "Program folder"),
                fields.get("phase"),
                fields.get("batchName"));
        List<List<String>> directories = new ArrayList<>();
        directories.add(base);
        List<DraftFile> files = new ArrayList<>();
        Set<String> identifiers = new HashSet<>();
        List<List<String>> existingWorkbooks = new ArrayList<>();

        upload(request.inputsWorkbook(), "inputs", base, files, identifiers);

        if (request.tests() == null || request.tests().isEmpty() || request.tests().size() > 50) {
            throw new TestAtlasException("Add between 1 and 50 vibration tests.");
        }
        Set<String> testNames = new HashSet<>();
        Set<String> modelIds = new HashSet<>();
        for (VibrationTest rawTest : request.tests()) {
            if (rawTest == null) {
                throw new TestAtlasException("Invalid vibration test.");
            }
            modelId(rawTest.id(), modelIds);
            String testCode = safePart(rawTest.testCode(), "test code");
            String testType = safePart(rawTest.testType(), "vibration test type");
            String axis = safePart(rawTest.axis(), "axis");
            String testFolder = joinName(List.of(testCode, testType, axis), "Test folder");
            if (!testNames.add(lower(testFolder))) {
                throw new TestAtlasException("Duplicate test folder: " + testFolder + ".");
            }
            List<String> testPath = with(base, testFolder);
            directories.add(testPath);
            if (rawTest.materialMasters() == null || rawTest.materialMasters().isEmpty()
                    || rawTest.materialMasters().size() > 100) {
                throw new TestAtlasException("Add between 1 and 100 Material Masters to " + testFolder + ".");
            }
            Set<String> sampleCodes = new HashSet<>();
            for (MaterialMaster rawSample : rawTest.materialMasters()) {
                if (rawSample == null) {
                    throw new TestAtlasException("Invalid Material Master.");
                }
                modelId(rawSample.id(), modelIds);
                String code = safePart(rawSample.materialMasterCode(), "Material Master code");
                boolean hasIncidents = Boolean.TRUE.equals(rawSample.hasIncidents());
                if (!sampleCodes.add(lower(code))) {
                    throw new TestAtlasException("Duplicate Material Master " + code + " in " + testFolder + ".");
                }
                List<String> samplePath = with(testPath, code);
                directories.add(samplePath);
                if (rawSample.inputsWorkbook() != null) {
                    upload(rawSample.inputsWorkbook(), "sampleInputs", samplePath, files, identifiers);
                } else {
                    if (rawSample.existingWorkbook() == null || rawSample.existingWorkbook().isEmpty()) {
                        throw new TestAtlasException("Select an inputs workbook for " + code + ".");
                    }
                    String name = originalName(rawSample.existingWorkbook(), true, 255);
                    if (!WORKBOOK_EXTENSIONS.contains(extension(name))) {
                        throw new TestAtlasException("Select an inputs workbook for " + code + ".");
                    }
                    repository.ensureNotLink(repository.destination(with(samplePath, name)));
                    boolean found = repository.entries(repository.destination(samplePath)).stream()
                            .anyMatch(entry -> Files.isRegularFile(entry)
                                    && lower(entry.getFileName().toString()).equals(lower(name)));
                    if (!found) {
                        throw new TestAtlasException("Inputs workbook for " + code
                                + " is missing. Select a file or an existing workbook.");
                    }
                    existingWorkbooks.add(with(samplePath, name));
                }
                List<Map.Entry<String, List<FileEntry>>> groups = List.of(
                        Map.entry("photos", orEmpty(rawSample.photos())),
                        Map.entry("results", orEmpty(rawSample.results())),
                        Map.entry("characterization", orEmpty(rawSample.characterization())),
                        Map.entry("incidentFiles", orEmpty(rawSample.incidentFiles())));
                Map<String, String> folders = Map.of(
                        "photos", "01_Fotos",
                        "results", "02_Resultados",
                        "characterization", "03_Caracterizacion",
                        "incidentFiles", "90_Incidencias");
                for (Map.Entry<String, List<FileEntry>> group : groups) {
                    String key = group.getKey();
                    List<FileEntry> rawFiles = group.getValue();
                    if (key.equals("incidentFiles") && !hasIncidents && !rawFiles.isEmpty()) {
                        throw new TestAtlasException(
                                "Enable incidents for " + code + " before adding incident files.");
                    }
                    List<String> target = with(samplePath, folders.get(key));
                    if (!key.equals("incidentFiles") || hasIncidents) {
                        directories.add(target);
                    }
                    for (FileEntry raw : rawFiles) {
                        upload(raw, key, target, files, identifiers);
                    }
                }
            }
        }
        if (files.size() > MAX_FILES) {
            throw new TestAtlasException("Add no more than " + MAX_FILES + " files.");
        }

        // Prevent a workbook name from colliding with one of the declared folders.
        Set<String> folderKeys = new HashSet<>();
        directories.forEach(parts -> folderKeys.add(lower(join(parts))));
        for (List<String> parts : directories) {
            // Check parents too: an existing ordinary file cannot become a directory.
            for (int index = 1; index <= parts.size(); index++) {
                List<String> prefix = parts.subList(0, index);
                Path target = repository.destination(prefix);
                repository.ensureNotLink(target);
                if (repository.exists(target) && !repository.isDirectory(target)) {
                    throw new TestAtlasException("A file occupies a required folder: " + join(prefix) + ".");
                }
            }
        }
        Set<String> targets = new HashSet<>();
        for (DraftFile file : files) {
            String key = lower(file.relative);
            if (targets.contains(key) || folderKeys.contains(key)) {
                throw new TestAtlasException("Two items have the same destination: " + file.relative + ".");
            }
            targets.add(key);
            Path target = repository.destination(with(file.targetParts, file.targetName));
            repository.ensureNotLink(target);
            file.conflict = repository.exists(target);
            if (file.conflict && !repository.isFile(target)) {
                throw new TestAtlasException("A folder occupies a file destination: " + file.relative + ".");
            }
        }

        return new TestAtlasPlan(
                "vibration",
                Map.copyOf(fields),
                base,
                join(base),
                files.stream().map(DraftFile::toRecord).toList(),
                List.of(),
                List.of(),
                List.copyOf(directories),
                List.copyOf(existingWorkbooks),
                List.of());
    }

    private void upload(FileEntry raw, String category, List<String> targetParts,
            List<DraftFile> files, Set<String> identifiers) {
        if (raw == null) {
            throw new TestAtlasException("Select a valid " + category + " file.");
        }
        DraftFile file = new DraftFile();
        file.id = validateIdentifier(raw.id(), "file identifier");
        if (!identifiers.add(file.id)) {
            throw new TestAtlasException("Duplicate file identifiers.");
        }
        file.name = originalName(raw.name(), true, 255);
        file.size = validateFileSize(raw.size(), file.name);
        file.mime = raw.mime() == null ? "" : raw.mime();
        if ((category.equals("inputs") || category.equals("sampleInputs"))
                && !WORKBOOK_EXTENSIONS.contains(extension(file.name))) {
            throw new TestAtlasException("Inputs workbooks must be .xlsx or .xlsm.");
        }
        if (category.equals("photos") && !VIBRATION_IMAGE_EXTENSIONS.contains(extension(file.name))
                && !file.mime.startsWith("image/")) {
            throw new TestAtlasException(file.name + ": select an image for Photos.");
        }
        file.category = category;
        file.targetName = file.name;
        file.targetParts = targetParts;
        file.relative = join(with(targetParts, file.name));
        file.checkRelative = file.relative;
        files.add(file);
    }

    private static void modelId(String raw, Set<String> modelIds) {
        String id = validateIdentifier(raw, "model identifier");
        if (!modelIds.add(id)) {
            throw new TestAtlasException("Duplicate test or sample identifiers.");
        }
    }

    private static String joinName(List<String> values, String label) {
        String name = String.join("_", values);
        if (name.length() > 255) {
            throw new TestAtlasException(label + " is too long.");
        }
        return name;
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    static List<String> with(List<String> parts, String part) {
        List<String> result = new ArrayList<>(parts);
        result.add(part);
        return List.copyOf(result);
    }

    /** Mutable working copy of a planned file while names are being resolved. */
    private static final class DraftFile {
        String id;
        String name;
        String category;
        long size;
        String mime;
        String captureDate;
        String dateSource;
        String evidenceId;
        int order;
        List<String> targetParts;
        List<String> checkParts;
        String targetName;
        String relative;
        String checkRelative;
        boolean conflict;

        PlannedFile toRecord() {
            return new PlannedFile(id, name, category, size, mime, captureDate, dateSource, evidenceId,
                    targetParts, targetName, relative, checkRelative, conflict);
        }
    }

    /** Mutable working copy of an evidence checkpoint. */
    private static final class DraftEvidence {
        String id;
        String type;
        String title;
        String referenceType;
        String referenceValue;
        String notes;
        String existingFolder;
        int sequence;
        String folderName;
        List<String> path;
        List<String> sourcePath;
        List<DraftFile> files;

        PlannedEvidence toRecord() {
            return new PlannedEvidence(id, type, title, referenceType, referenceValue, notes, existingFolder,
                    sequence, folderName, path, sourcePath, files.stream().map(DraftFile::toRecord).toList());
        }
    }
}
