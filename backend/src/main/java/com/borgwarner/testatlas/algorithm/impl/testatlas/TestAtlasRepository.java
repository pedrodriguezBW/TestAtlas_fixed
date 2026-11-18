package com.borgwarner.testatlas.algorithm.impl.testatlas;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The project repository: the folder under which every test is organised, plus
 * the containment and link checks that keep generated destinations inside it.
 *
 * <p>Climatic and vibration tests are saved under different roots:
 * <ul>
 *   <li>{@code testatlas.repository-root} (climatic), set in
 *       {@code application.properties} to
 *       {@code \\vigvsfil1.global.borgwarner.net\vigproductengineering\Documentacion_I+D\R&T\9. CL}
 *       and overridden by {@code TESTATLAS_REPOSITORY_ROOT};</li>
 *   <li>{@code testatlas.vibration-repository-root} (vibration), set to
 *       {@code \\vigvsfil1.global.borgwarner.net\vigproductengineering\Documentacion_I+D\R&T\7. Vib}
 *       and overridden by {@code TESTATLAS_VIBRATION_REPOSITORY_ROOT}.</li>
 * </ul>
 * Both must be writable by the account that runs the backend. The bean is the
 * climatic repository; {@link #forType(String)} returns the repository of a
 * workflow. The Desktop {@code Proyectos} folder of the original Test Atlas is
 * only used if the properties are missing.
 */
@Component
public class TestAtlasRepository {

    private final Path root;
    private final TestAtlasRepository vibration;

    /** Climatic and vibration workflows saved under the same root (tests and local tools). */
    public TestAtlasRepository(String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.vibration = this;
    }

    @Autowired
    public TestAtlasRepository(
            @Value("${testatlas.repository-root:${user.home}/Desktop/Proyectos}") String root,
            @Value("${testatlas.vibration-repository-root:${user.home}/Desktop/Proyectos/Vibration}")
            String vibrationRoot) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.vibration = new TestAtlasRepository(vibrationRoot);
    }

    public Path root() {
        return root;
    }

    /** Repository of a workflow: {@code "vibration"} has its own root; anything else is climatic. */
    public TestAtlasRepository forType(String testType) {
        return "vibration".equals(testType) ? vibration : this;
    }

    /** Repository of the vibration workflow. */
    public TestAtlasRepository vibration() {
        return vibration;
    }

    /**
     * Build an absolute path from validated segments and reject it if
     * resolution, including ".." components, places it outside the repository.
     */
    public Path destination(List<String> parts) {
        Path target = root;
        for (String part : parts) {
            target = target.resolve(part);
        }
        target = target.normalize();
        if (!target.startsWith(root)) {
            throw new TestAtlasException("Invalid destination.");
        }
        return target;
    }

    /** Check whether a destination is already occupied, without hiding permission errors. */
    public boolean exists(Path file) {
        return Files.exists(file, LinkOption.NOFOLLOW_LINKS);
    }

    public boolean isDirectory(Path file) {
        return Files.isDirectory(file);
    }

    public boolean isFile(Path file) {
        return Files.isRegularFile(file);
    }

    /**
     * Read a directory for suggestions or conflict detection, sorted by name. A
     * missing directory is treated as an empty one because the application
     * creates the structure on commit.
     */
    public List<Path> entries(Path directory) {
        if (!Files.isDirectory(directory)) {
            return List.of();
        }
        try (Stream<Path> stream = Files.list(directory)) {
            List<Path> entries = new ArrayList<>(stream.toList());
            entries.sort(Comparator.comparing((Path path) -> path.getFileName().toString(), String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(path -> path.getFileName().toString()));
            return entries;
        } catch (NoSuchFileException exception) {
            return List.of();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    /**
     * Walk each existing destination component and reject symbolic links and
     * junctions. This closes the gap left by string-based path validation when
     * links point outside the root.
     */
    public void ensureNotLink(Path target) {
        Path current = root;
        for (Path segment : root.relativize(target)) {
            current = current.resolve(segment);
            try {
                BasicFileAttributes attributes = Files.readAttributes(
                        current, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                if (attributes.isSymbolicLink() || attributes.isOther()) {
                    throw new TestAtlasException("A destination uses a symbolic link.");
                }
                if (!attributes.isDirectory() && !current.equals(target)) {
                    // An ordinary file where a folder is needed: deeper components
                    // cannot exist (Linux reports ENOTDIR instead of "not found").
                    throw new TestAtlasException("A file occupies a required folder: "
                            + root.relativize(current) + ".");
                }
            } catch (NoSuchFileException exception) {
                // Missing components are created on save.
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
        }
    }

    /**
     * Verify that the repository root exists (creating it) and that the service
     * can create and remove a file there. This catches protected or offline
     * folders before anything is saved.
     */
    public void ensureWritable() {
        try {
            Files.createDirectories(root);
            Path probe = root.resolve(".test-atlas-write-test-" + UUID.randomUUID());
            Files.writeString(probe, "");
            Files.deleteIfExists(probe);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
