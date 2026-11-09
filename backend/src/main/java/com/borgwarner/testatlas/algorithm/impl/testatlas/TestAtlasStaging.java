package com.borgwarner.testatlas.algorithm.impl.testatlas;

import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.MAX_BYTES;
import static com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasNames.METADATA_FILE;

import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlan.PlannedFile;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Temporary storage for the files of a reviewed Test Atlas plan. The browser
 * streams every file here before running the algorithm, so file contents never
 * travel inside the JSON configuration. Each upload lives in its own folder
 * under the staging root together with a {@code manifest.json} that records the
 * reviewed size and category of every expected file; a file whose byte count
 * differs from the review is rejected, like the original Test Atlas sessions.
 *
 * <p>Uploads are discarded after the save and stale ones (older than one hour)
 * are purged whenever a new upload is created.
 */
@Component
public class TestAtlasStaging {

    private static final Pattern UPLOAD_ID = Pattern.compile("^[a-f0-9-]{36}$");
    private static final Duration MAX_AGE = Duration.ofHours(1);

    private final Path root;
    private final ObjectMapper mapper;

    public TestAtlasStaging(
            @Value("${testatlas.staging-root:${java.io.tmpdir}/test-atlas-staging}") String root,
            ObjectMapper mapper) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.mapper = mapper;
    }

    /** Expected size and category of one reviewed file. */
    public record Expected(long size, String category) {
    }

    /** Create an upload for the files of a reviewed plan and return its identifier. */
    public String create(TestAtlasPlan plan) {
        purgeStale();
        String id = UUID.randomUUID().toString();
        Map<String, Expected> expected = new LinkedHashMap<>();
        for (PlannedFile file : plan.files()) {
            expected.put(file.id(), new Expected(file.size(), file.category()));
        }
        try {
            Path folder = Files.createDirectories(folder(id));
            Files.writeString(folder.resolve("manifest.json"), mapper.writeValueAsString(expected));
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        return id;
    }

    /**
     * Store one file of an upload. Its byte count must match the size declared
     * and reviewed in the manifest, and {@code test_metadata.json} must contain
     * valid JSON before it is accepted.
     */
    public void store(String uploadId, String fileId, InputStream content) {
        Map<String, Expected> expected = manifest(uploadId);
        Expected file = expected.get(TestAtlasNames.validateIdentifier(fileId, "file identifier"));
        if (file == null) {
            throw new TestAtlasException("File not found in review.", 404);
        }
        Path target = folder(uploadId).resolve(fileId);
        try (OutputStream out = Files.newOutputStream(target,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
            byte[] buffer = new byte[64 * 1024];
            long bytes = 0;
            int read;
            while ((read = content.read(buffer)) >= 0) {
                bytes += read;
                if (bytes > file.size() || bytes > MAX_BYTES) {
                    throw new TestAtlasException("Upload size differs from review.");
                }
                out.write(buffer, 0, read);
            }
            if (bytes != file.size()) {
                throw new TestAtlasException("Upload size differs from review.");
            }
        } catch (IOException exception) {
            delete(target);
            throw new UncheckedIOException(exception);
        } catch (RuntimeException exception) {
            delete(target);
            throw exception;
        }
        if ("metadata".equals(file.category())) {
            try {
                mapper.readValue(Files.readString(target), Object.class);
            } catch (IOException | RuntimeException exception) {
                delete(target);
                throw new TestAtlasException(METADATA_FILE + " does not contain valid JSON.");
            }
        }
    }

    /**
     * Resolve the staged content of every file of a plan. Fails when a file was
     * not uploaded, or when its staged size differs from the plan.
     */
    public Map<String, Path> resolve(String uploadId, TestAtlasPlan plan) {
        if (plan.files().isEmpty()) {
            return Map.of();
        }
        if (uploadId == null || uploadId.isBlank()) {
            throw new TestAtlasException("Some files have not uploaded.");
        }
        Path folder = folder(uploadId);
        if (!Files.isDirectory(folder)) {
            throw new TestAtlasException("Upload session not found.", 404);
        }
        Map<String, Path> staged = new HashMap<>();
        for (PlannedFile file : plan.files()) {
            Path content = folder.resolve(file.id());
            try {
                if (!Files.isRegularFile(content) || Files.size(content) != file.size()) {
                    throw new TestAtlasException("Some files have not uploaded.");
                }
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
            staged.put(file.id(), content);
        }
        return Map.copyOf(staged);
    }

    /** Remove the staged files of a completed, cancelled or failed upload. */
    public void discard(String uploadId) {
        if (uploadId == null || !UPLOAD_ID.matcher(uploadId).matches()) {
            return;
        }
        deleteRecursively(folder(uploadId));
    }

    private Path folder(String uploadId) {
        if (uploadId == null || !UPLOAD_ID.matcher(uploadId).matches()) {
            throw new TestAtlasException("Upload session not found.", 404);
        }
        return root.resolve(uploadId);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Expected> manifest(String uploadId) {
        Path manifest = folder(uploadId).resolve("manifest.json");
        if (!Files.isRegularFile(manifest)) {
            throw new TestAtlasException("Upload session not found.", 404);
        }
        try {
            Map<String, Object> raw = mapper.readValue(Files.readString(manifest), Map.class);
            Map<String, Expected> expected = new LinkedHashMap<>();
            raw.forEach((id, value) -> {
                Map<String, Object> entry = (Map<String, Object>) value;
                expected.put(id, new Expected(((Number) entry.get("size")).longValue(), (String) entry.get("category")));
            });
            return expected;
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private void purgeStale() {
        if (!Files.isDirectory(root)) {
            return;
        }
        Instant limit = Instant.now().minus(MAX_AGE);
        try (Stream<Path> uploads = Files.list(root)) {
            for (Path upload : uploads.toList()) {
                FileTime modified = Files.getLastModifiedTime(upload);
                if (modified.toInstant().isBefore(limit)) {
                    deleteRecursively(upload);
                }
            }
        } catch (IOException exception) {
            // Stale uploads are only housekeeping; never block a new upload on them.
        }
    }

    private static void delete(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException exception) {
            // Best effort cleanup.
        }
    }

    private static void deleteRecursively(Path folder) {
        if (!Files.exists(folder)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(folder)) {
            List<Path> ordered = paths.sorted(Comparator.reverseOrder()).toList();
            for (Path path : ordered) {
                Files.deleteIfExists(path);
            }
        } catch (IOException exception) {
            // Best effort cleanup.
        }
    }
}
