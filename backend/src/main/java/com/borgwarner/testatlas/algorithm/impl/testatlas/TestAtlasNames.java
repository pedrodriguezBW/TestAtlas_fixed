package com.borgwarner.testatlas.algorithm.impl.testatlas;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Naming rules and validators of Test Atlas, translated one to one from the
 * helpers of the original {@code server.js}. Everything here is pure: no file
 * system access.
 */
public final class TestAtlasNames {

    private TestAtlasNames() {
    }

    public static final int MAX_FILES = 500;
    public static final long MAX_BYTES = 2L * 1024 * 1024 * 1024;

    public static final Set<String> EVIDENCE_TYPES = Set.of(
            "initial", "planned_inspection", "unplanned_stop", "incident", "restart", "final", "other");

    public static final Set<String> REFERENCE_TYPES = Set.of("cycles", "hours", "stage", "date_time", "none");

    public static final Set<String> IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif", ".avif", ".bmp", ".gif", ".dng");

    /** Vibration photos also accept browser-only image formats. */
    public static final Set<String> VIBRATION_IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif", ".avif", ".bmp", ".gif", ".dng",
            ".svg", ".ico");

    /**
     * SIMPATI (Weiss Technik) assigns each test system a Simpati ID from 01 to 99.
     * Archived measurement files use ".x" + that ID and symbolic/graphical test
     * programs use ".p"/".b" + ID.
     */
    private static final Pattern SIMPATI_NUMBERED_EXTENSION = Pattern.compile("^\\.[xpb]\\d{2}$");

    /** Vector CANoe / CANalyzer logging files, stored in 03_Data\03_CANoe. */
    public static final List<String> CANOE_EXTENSIONS = List.of(".blf", ".asc", ".mf4", ".mdf", ".pcap", ".pcapng");

    /** The test metadata file has a fixed name and is stored in 04_Report. */
    public static final String METADATA_FILE = "test_metadata.json";
    public static final long METADATA_MAX_BYTES = 10L * 1024 * 1024;

    /** How a photo's date was obtained (kept in evidence.json). */
    public static final Set<String> DATE_SOURCES = Set.of("metadata", "modified", "test");

    /** Evidence checkpoint folders managed by the app: "NN_Name". */
    public static final Pattern EVIDENCE_FOLDER = Pattern.compile("^\\d{2}_.+$");
    public static final Set<String> FIXED_EVIDENCE_FOLDERS = Set.of("00_initial", "99_final");

    /** Inputs workbooks are recognised by extension in 01_Inputs. */
    public static final List<String> WORKBOOK_EXTENSIONS = List.of(".xlsx", ".xlsm");

    public static final List<String> CLIMATIC_CATEGORIES = List.of("inputs", "simpati", "graphtec", "canoe", "metadata");

    /** Image types a browser can display as a thumbnail. */
    public static final Map<String, String> PREVIEW_TYPES = Map.of(
            ".jpg", "image/jpeg",
            ".jpeg", "image/jpeg",
            ".png", "image/png",
            ".webp", "image/webp",
            ".gif", "image/gif",
            ".bmp", "image/bmp",
            ".avif", "image/avif");

    /** Folder name word -> evidence type, for checkpoints without evidence.json. */
    public static final Map<String, String> EVIDENCE_TYPE_BY_NAME = Map.of(
            "inspection", "planned_inspection",
            "unplannedstop", "unplanned_stop",
            "incident", "incident",
            "restart", "restart",
            "other", "other");

    private static final Pattern INVALID_PART_CHARACTERS = Pattern.compile("[<>:\"/\\\\|?*\\x00-\\x1f]");
    private static final Pattern TRAILING_DOT_OR_SPACE = Pattern.compile("[. ]$");
    private static final Pattern DOT_SEGMENTS = Pattern.compile("^\\.{1,2}$");
    private static final Pattern RESERVED_NAMES = Pattern.compile(
            "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern IDENTIFIER = Pattern.compile("^[a-f0-9-]{12,80}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern CAPTURE_DATE = Pattern.compile(
            "^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})$");
    private static final Pattern TEST_DATE = Pattern.compile("^\\d{6}$");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    /** Windows-style relative path used in reviews, results and conflict checks. */
    public static String join(List<String> parts) {
        return String.join("\\", parts);
    }

    public static List<String> split(String relative) {
        return List.of(relative.split("\\\\"));
    }

    public static boolean isSimpatiExtension(String fileExtension) {
        return SIMPATI_NUMBERED_EXTENSION.matcher(fileExtension).matches();
    }

    /**
     * Normalise a user-supplied folder or file component before it is used in a
     * path. The checks cover invalid Windows characters, reserved device names
     * and traversal parts.
     */
    public static String safePart(String raw, String label) {
        return safePart(raw, label, 90);
    }

    public static String safePart(String raw, String label, int maxLength) {
        String value = WHITESPACE.matcher(raw == null ? "" : raw.strip()).replaceAll(" ");
        if (value.isEmpty()
                || value.length() > maxLength
                || INVALID_PART_CHARACTERS.matcher(value).find()
                || TRAILING_DOT_OR_SPACE.matcher(value).find()
                || DOT_SEGMENTS.matcher(value).matches()
                || RESERVED_NAMES.matcher(value).find()) {
            throw new TestAtlasException("Enter a valid " + label + ".");
        }
        return value;
    }

    /**
     * Validate the original upload name and require a plain basename so a client
     * cannot smuggle directory components inside the file name.
     */
    public static String originalName(String raw) {
        return originalName(raw, false, 90);
    }

    public static String originalName(String raw, boolean preserve, int maxLength) {
        String normalized = safePart(raw, "file name", maxLength);
        String name = preserve ? String.valueOf(raw) : normalized;
        if (name.length() > maxLength || TRAILING_DOT_OR_SPACE.matcher(name).find()) {
            throw new TestAtlasException("Invalid file name.");
        }
        if (name.contains("/") || name.contains("\\")) {
            throw new TestAtlasException("Invalid file name.");
        }
        return name;
    }

    /** Lower-case extension including the dot, like Node's {@code path.extname}. */
    public static String extension(String name) {
        int index = name.lastIndexOf('.');
        return index <= 0 ? "" : name.substring(index).toLowerCase(Locale.ROOT);
    }

    public static String validateIdentifier(String raw, String label) {
        String value = raw == null ? "" : raw;
        if (!IDENTIFIER.matcher(value).matches()) {
            throw new TestAtlasException("Invalid " + label + ".");
        }
        return value;
    }

    public static long validateFileSize(Long raw, String name) {
        if (raw == null || raw < 0 || raw > MAX_BYTES) {
            throw new TestAtlasException("Invalid size for " + name + ".");
        }
        return raw;
    }

    public static String cleanOptionalText(String raw, int maximumLength, String label) {
        String value = raw == null ? "" : raw.strip();
        if (value.length() > maximumLength) {
            throw new TestAtlasException(label + " is too long.");
        }
        return value;
    }

    /**
     * Validate an ISO capture timestamp received from the browser and convert it
     * into the YYMMDD prefix used by the photo naming convention.
     */
    public static String dateCode(String iso) {
        Matcher match = CAPTURE_DATE.matcher(iso == null ? "" : iso);
        if (!match.matches()) {
            throw new TestAtlasException("A photo is missing a valid capture date.");
        }
        try {
            LocalDateTime.parse(iso);
        } catch (DateTimeParseException exception) {
            throw new TestAtlasException("A photo has an invalid capture date.");
        }
        return match.group(1).substring(2) + match.group(2) + match.group(3);
    }

    /**
     * Validate the manually entered test date, including real calendar
     * boundaries such as leap years and the number of days in each month.
     */
    public static String validateDate(String raw) {
        String value = raw == null ? "" : raw;
        if (!TEST_DATE.matcher(value).matches()) {
            throw new TestAtlasException("Test date must use YYMMDD.");
        }
        int year = 2000 + Integer.parseInt(value.substring(0, 2));
        int month = Integer.parseInt(value.substring(2, 4));
        int day = Integer.parseInt(value.substring(4));
        try {
            LocalDate.of(year, month, day);
        } catch (java.time.DateTimeException exception) {
            throw new TestAtlasException("Enter a real test date in YYMMDD format.");
        }
        return value;
    }

    /** Restrict climatic files to the categories supported by the repository structure. */
    public static String fileCategory(String category) {
        if (category == null || !CLIMATIC_CATEGORIES.contains(category)) {
            throw new TestAtlasException("Invalid file category.");
        }
        return category;
    }

    public static String folderToken(String raw, String label) {
        return WHITESPACE.matcher(safePart(raw, label)).replaceAll("").replaceAll("_+", "-");
    }

    public static String evidenceTypeName(String type) {
        return switch (type) {
            case "initial" -> "Initial";
            case "planned_inspection" -> "Inspection";
            case "unplanned_stop" -> "UnplannedStop";
            case "incident" -> "Incident";
            case "restart" -> "Restart";
            case "final" -> "Final";
            case "other" -> "Other";
            default -> "";
        };
    }

    public static String evidenceReferenceName(String type, String value) {
        if ("none".equals(type) || value == null || value.isEmpty()) {
            return "";
        }
        String token = folderToken(value, "evidence reference");
        return switch (type) {
            case "cycles" -> token + "Cycles";
            case "hours" -> token + "Hours";
            case "stage" -> "Stage-" + token;
            case "date_time" -> token.replace(':', '-');
            default -> "";
        };
    }

    public static String evidenceFolderName(String type, String referenceType, String referenceValue, int position) {
        if ("initial".equals(type)) {
            return "00_Initial";
        }
        if ("final".equals(type)) {
            return "99_Final";
        }
        String sequence = String.format("%02d", position);
        String reference = evidenceReferenceName(referenceType, referenceValue);
        StringBuilder name = new StringBuilder(sequence).append('_').append(evidenceTypeName(type));
        if (!reference.isEmpty()) {
            name.append('_').append(reference);
        }
        return name.toString();
    }

    public static String lower(String value) {
        return value.toLowerCase(Locale.ROOT);
    }
}
