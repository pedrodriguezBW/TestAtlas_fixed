package com.borgwarner.testatlas.algorithm.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import com.borgwarner.testatlas.algorithm.AlgorithmMetadata;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Out_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Out_TestAtlas.RenamedFolder;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Strategy_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasPlanner;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepository;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasStaging;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TestAtlasSummaryTest {

    private final Strategy_TestAtlas strategy = new Strategy_TestAtlas(
            mock(TestAtlasRepository.class), mock(TestAtlasPlanner.class), mock(TestAtlasRepositoryReader.class),
            mock(TestAtlasStaging.class), new ObjectMapper());

    @Test
    void summarizesFolderFilesAndRenames() {
        Out_TestAtlas output = new Out_TestAtlas(
                "80025 - BMW\\DV\\TEST - 486",
                "C:\\Proyectos\\80025 - BMW\\DV\\TEST - 486",
                List.of("a", "b", "c"),
                List.of("d1", "d2", "d3", "d4"),
                List.of("e"),
                List.of(new RenamedFolder("02_Incident", "01_Incident")));

        assertEquals("Organized 80025 - BMW\\DV\\TEST - 486: 3 files saved, 4 folders, 1 checkpoints renamed",
                strategy.summarize(output));
    }

    @Test
    void declaresFileRepositoryMetadataAndJsonResultShape() {
        assertEquals(new AlgorithmMetadata(
                Set.of(AlgorithmMetadata.Platform.FILE_REPOSITORY),
                Set.of(AlgorithmMetadata.Role.ANYONE),
                Set.of(AlgorithmMetadata.Tag.TEST_MANAGEMENT)), strategy.getMetadata());
        var json = new ObjectMapper().valueToTree(
                new Out_TestAtlas("f", "p", List.of(), List.of(), List.of(), List.of()));
        assertEquals(Set.of("folder", "folderPath", "saved", "directories", "generatedFiles", "renamedFolders"),
                new java.util.HashSet<>(json.propertyNames()));
    }
}
