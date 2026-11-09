package com.borgwarner.testatlas.algorithm.impl.testatlas;

import com.borgwarner.testatlas.algorithm.interfaces.I_OutputData;
import java.util.List;

/**
 * Result of a Test Atlas save. Paths are relative to the project repository and
 * use the Windows separator, exactly like the review returned before the run.
 * {@code folderPath} is the absolute path of the test (or batch) folder on the
 * server, shown to the user instead of opening Windows Explorer.
 */
public record Out_TestAtlas(
        String folder,
        String folderPath,
        List<String> saved,
        List<String> directories,
        List<String> generatedFiles,
        List<RenamedFolder> renamedFolders) implements I_OutputData {

    public record RenamedFolder(String from, String to) {
    }
}
