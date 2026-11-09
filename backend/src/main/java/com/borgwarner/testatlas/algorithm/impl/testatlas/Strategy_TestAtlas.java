package com.borgwarner.testatlas.algorithm.impl.testatlas;

import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.join;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.lower;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.split;

import com.borgwarner.testatlas.algorithm.AlgorithmMetadata;
import com.borgwarner.testatlas.algorithm.AlgorithmMetadata.Platform;
import com.borgwarner.testatlas.algorithm.AlgorithmMetadata.Role;
import com.borgwarner.testatlas.algorithm.AlgorithmMetadata.Tag;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Out_TestAtlas.RenamedFolder;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedEvidence;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedFile;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.Rename;
import com.borgwarner.testatlas.algorithm.interfaces.I_ExecutableAlgorithm;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Test Atlas: organises climatic (and, when enabled, vibration) test files,
 * photographic evidence and measurement data into the standard folder
 * structure of the project repository.
 *
 * <p>The run is the commit step of the original Test Atlas: the reviewed plan
 * is recalculated from the manifest, every destination is checked again for
 * links and new conflicts, reordered checkpoint folders are renamed, folders
 * are created, {@code evidence.json} descriptors are written and the staged
 * files are moved into place. Existing files are replaced only when their
 * identifiers were approved in the review ({@code approvedOverwrites}).
 */
@Component
public class Strategy_TestAtlas implements I_ExecutableAlgorithm<Conf_TestAtlas, Out_TestAtlas> {

    private final TestAtlasRepository repository;
    private final TestAtlasPlanner planner;
    private final TestAtlasRepositoryReader reader;
    private final TestAtlasStaging staging;
    private final ObjectMapper mapper;

    public Strategy_TestAtlas(
            TestAtlasRepository repository,
            TestAtlasPlanner planner,
            TestAtlasRepositoryReader reader,
            TestAtlasStaging staging,
            ObjectMapper mapper) {
        this.repository = repository;
        this.planner = planner;
        this.reader = reader;
        this.staging = staging;
        this.mapper = mapper;
    }

    @Override
    public String getVersion() {
        return "1.0";
    }

    @Override
    public String getAlgorithm() {
        return "TEST_ATLAS";
    }

    @Override
    public AlgorithmMetadata getMetadata() {
        return new AlgorithmMetadata(
                Set.of(Platform.FILE_REPOSITORY), Set.of(Role.ANYONE), Set.of(Tag.TEST_MANAGEMENT));
    }

    @Override
    public Class<Conf_TestAtlas> getConfigClass() {
        return Conf_TestAtlas.class;
    }

    @Override
    public Out_TestAtlas execute(Conf_TestAtlas config, I_ProgressListener progress) {
        String runId = UUID.randomUUID().toString();
        int total = 2;
        progress.report(0, total, "Checking the repository");
        TestAtlasPlan plan = planner.plan(config);
        Map<String, Path> staged = staging.resolve(config.uploadId(), plan);
        Set<String> approved = approvedOverwrites(config, plan);
        total = 2 + plan.directories().size() + plan.evidenceSets().size() + plan.files().size();
        int current = 1;
        progress.report(current, total, "Reviewed " + plan.folder());

        try {
            // Recheck links and conflicts because the repository may have changed
            // while the user was uploading files. Files inside a folder that will
            // be renamed are checked at its current location (checkRelative).
            for (PlannedFile file : plan.files()) {
                Path currentPath = repository.destination(split(file.checkRelative()));
                repository.ensureNotLink(currentPath);
                if (repository.exists(currentPath) && !approved.contains(file.id())) {
                    throw new TestAtlasException(
                            "New conflict: " + file.relative() + ". Review again before saving.", 409);
                }
            }
            // No folder may be redirected through a link, and every reused workbook
            // must still be present when the save is committed.
            for (List<String> parts : plan.directories()) {
                repository.ensureNotLink(repository.destination(parts));
            }
            for (List<String> parts : plan.existingWorkbooks()) {
                Path target = repository.destination(parts);
                repository.ensureNotLink(target);
                if (!repository.exists(target) || !repository.isFile(target)) {
                    throw new TestAtlasException("An existing inputs workbook was removed. Review again.", 409);
                }
            }

            // Reordered evidence checkpoints: rename their folders before creating
            // the new ones, so every folder ends with its new position number.
            renameEvidenceFolders(plan.renames(), runId);
            progress.report(++current, total, "Checked the repository");

            // Remove duplicate paths before creating folders: 02_Evidences and each
            // checkpoint path share part of their hierarchy.
            Map<String, List<String>> uniqueDirectories = new LinkedHashMap<>();
            for (List<String> parts : plan.directories()) {
                uniqueDirectories.put(lower(join(parts)), parts);
            }
            for (List<String> parts : uniqueDirectories.values()) {
                Files.createDirectories(repository.destination(parts));
            }
            for (List<String> parts : plan.directories()) {
                progress.report(++current, total, "Created " + join(parts));
            }

            // Write one structured descriptor for every evidence set. A temporary
            // adjacent file prevents exposing incomplete JSON.
            for (PlannedEvidence evidence : plan.evidenceSets()) {
                writeEvidenceDescriptor(evidence, runId);
                progress.report(++current, total, "Recorded " + evidence.folderName());
            }

            List<String> saved = new ArrayList<>();
            for (PlannedFile file : plan.files()) {
                Path target = repository.destination(split(file.relative()));
                // Copy beside the target first. The final rename avoids exposing a
                // partially copied file if the process is interrupted.
                Path incoming = target.resolveSibling(target.getFileName() + ".incoming-" + runId);
                Files.copy(staged.get(file.id()), incoming, StandardCopyOption.REPLACE_EXISTING);
                if (repository.exists(target) && !approved.contains(file.id())) {
                    Files.deleteIfExists(incoming);
                    throw new TestAtlasException("New conflict: " + file.relative() + ".", 409);
                }
                Files.move(incoming, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                saved.add(file.relative());
                progress.report(++current, total, "Saved " + file.relative());
            }

            return new Out_TestAtlas(
                    plan.folder(),
                    repository.destination(plan.base()).toString(),
                    List.copyOf(saved),
                    plan.directories().stream().map(TestAtlasNames::join).toList(),
                    plan.generatedFiles().stream().map(TestAtlasNames::join).toList(),
                    plan.renames().stream().map(rename -> new RenamedFolder(join(rename.from()), join(rename.to()))).toList());
        } catch (AccessDeniedException exception) {
            throw new TestAtlasException("Windows denied access to the project repository: " + repository.root()
                    + ". Blocked path: " + exception.getFile() + ".", 403);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        } finally {
            // A completed or failed save cannot be retried: discard its staged files.
            staging.discard(config.uploadId());
        }
    }

    @Override
    public String summarize(Out_TestAtlas output) {
        return String.format("Organized %s: %d files saved, %d folders, %d checkpoints renamed",
                output.folder(), output.saved().size(), output.directories().size(), output.renamedFolders().size());
    }

    /**
     * Only reviewed conflicts can be replaced, and every conflict needs an
     * explicit decision, exactly like the original session creation.
     */
    private static Set<String> approvedOverwrites(Conf_TestAtlas config, TestAtlasPlan plan) {
        Set<String> conflicts = new HashSet<>();
        for (PlannedFile file : plan.files()) {
            if (file.conflict()) {
                conflicts.add(file.id());
            }
        }
        List<String> requested = config.approvedOverwrites() == null ? List.of() : config.approvedOverwrites();
        for (String id : requested) {
            if (id == null || !conflicts.contains(id)) {
                throw new TestAtlasException("Only reviewed conflicts can be replaced. Please review again.", 409);
            }
        }
        Set<String> approved = new HashSet<>(requested);
        for (PlannedFile file : plan.files()) {
            if (file.conflict() && !approved.contains(file.id())) {
                throw new TestAtlasException("Choose whether to replace " + file.relative() + ".", 409);
            }
        }
        return approved;
    }

    /**
     * Rename reordered checkpoint folders in two phases (current name ->
     * temporary name -> new name), so two folders can swap positions without
     * colliding. If anything fails, the folders already moved are put back.
     */
    private void renameEvidenceFolders(List<Rename> renames, String runId) throws IOException {
        if (renames.isEmpty()) {
            return;
        }
        for (Rename item : renames) {
            Path from = repository.destination(item.from());
            repository.ensureNotLink(from);
            if (!repository.exists(from) || !repository.isDirectory(from)) {
                throw new TestAtlasException("The evidence folder " + item.from().getLast()
                        + " is no longer available. Review again.", 409);
            }
        }
        record Step(Path from, Path temp, Path to) {
        }
        List<Step> steps = new ArrayList<>();
        for (int index = 0; index < renames.size(); index++) {
            Rename item = renames.get(index);
            List<String> parent = new ArrayList<>(item.from().subList(0, item.from().size() - 1));
            parent.add(".reorder-" + runId + "-" + index);
            steps.add(new Step(
                    repository.destination(item.from()),
                    repository.destination(parent),
                    repository.destination(item.to())));
        }
        List<Map.Entry<String, Step>> done = new ArrayList<>();
        try {
            for (Step step : steps) {
                Files.move(step.from(), step.temp());
                done.add(Map.entry("temp", step));
            }
            for (Step step : steps) {
                if (repository.exists(step.to())) {
                    throw new TestAtlasException("A folder named " + step.to().getFileName()
                            + " already exists. Review again.", 409);
                }
                Files.move(step.temp(), step.to());
                done.add(Map.entry("final", step));
            }
        } catch (IOException | RuntimeException exception) {
            for (int index = done.size() - 1; index >= 0; index--) {
                Map.Entry<String, Step> entry = done.get(index);
                try {
                    if (entry.getKey().equals("final")) {
                        Files.move(entry.getValue().to(), entry.getValue().temp());
                    } else {
                        Files.move(entry.getValue().temp(), entry.getValue().from());
                    }
                } catch (IOException ignored) {
                    // Best effort rollback.
                }
            }
            throw exception;
        }
    }

    private void writeEvidenceDescriptor(PlannedEvidence evidence, String runId) throws IOException {
        Path directory = repository.destination(evidence.path());
        Path descriptorPath = directory.resolve("evidence.json");
        Path temporary = directory.resolve("evidence.json.incoming-" + runId);

        Map<String, Object> descriptor = new LinkedHashMap<>();
        descriptor.put("schemaVersion", 1);
        descriptor.put("id", evidence.id());
        descriptor.put("type", evidence.type());
        descriptor.put("title", evidence.title());
        Map<String, Object> reference = new LinkedHashMap<>();
        reference.put("type", evidence.referenceType());
        reference.put("value", evidence.referenceValue());
        descriptor.put("reference", reference);
        descriptor.put("notes", evidence.notes());
        descriptor.put("sequence", evidence.sequence());
        descriptor.put("folder", evidence.folderName());

        List<Map<String, Object>> photos = new ArrayList<>();
        Set<String> newNames = new HashSet<>();
        for (PlannedFile photo : evidence.files()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", photo.id());
            entry.put("originalName", photo.name());
            entry.put("savedName", photo.targetName());
            entry.put("captureDate", photo.captureDate());
            entry.put("dateSource", photo.dateSource());
            entry.put("mime", photo.mime());
            entry.put("size", photo.size());
            photos.add(entry);
            newNames.add(lower(photo.targetName()));
        }
        // Keep the records of photos saved in earlier sessions.
        List<Object> merged = new ArrayList<>();
        Map<String, Object> previous = reader.readEvidenceDescriptor(directory);
        if (previous != null && previous.get("photos") instanceof List<?> previousPhotos) {
            for (Object item : previousPhotos) {
                Object savedName = item instanceof Map<?, ?> previousPhoto ? previousPhoto.get("savedName") : null;
                if (savedName == null || !newNames.contains(lower(String.valueOf(savedName)))) {
                    merged.add(item);
                }
            }
        }
        merged.addAll(photos);
        descriptor.put("photos", merged);

        Files.writeString(temporary, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(descriptor));
        Files.deleteIfExists(descriptorPath);
        Files.move(temporary, descriptorPath, StandardCopyOption.ATOMIC_MOVE);
    }
}
