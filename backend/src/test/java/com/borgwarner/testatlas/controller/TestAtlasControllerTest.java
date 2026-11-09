package com.borgwarner.testatlas.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.borgwarner.testatlas.TestAtlasApplication;
import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasException;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader.EvidencePhoto;
import com.borgwarner.testatlas.controller.TestAtlasController;
import com.borgwarner.testatlas.dto.TestAtlasPlanDto;
import com.borgwarner.testatlas.dto.TestAtlasPlanDto.PlannedFileDto;
import com.borgwarner.testatlas.dto.TestAtlasSuggestionsDto;
import com.borgwarner.testatlas.dto.TestAtlasUploadDto;
import com.borgwarner.testatlas.dto.TestAtlasWorkbooksDto;
import com.borgwarner.testatlas.service.TestAtlasService;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.yaml.snakeyaml.Yaml;

@WebMvcTest(TestAtlasController.class)
@ContextConfiguration(classes = TestAtlasApplication.class)
class TestAtlasControllerTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private TestAtlasService service;

    private static final String CLIMATIC = """
            {"testType":"climatic","programNumber":"80025","programName":"BMW","phase":"DV","testNumber":"486",
             "date":"260930","files":[{"id":"00000000-0000-4000-8000-000000000001","name":"input.xlsm",
             "category":"inputs","size":15,"mime":""}],"evidenceSets":[]}
            """;

    @Test
    void reviewReturnsThePlannedTreeAndMatchesTheOpenApiContract() throws Exception {
        TestAtlasPlanDto plan = new TestAtlasPlanDto("C:\\Proyectos", "80025 - BMW\\DV\\TEST - 486",
                List.of("80025 - BMW\\DV\\TEST - 486"), List.of(), List.of(), List.of(),
                List.of(new PlannedFileDto("00000000-0000-4000-8000-000000000001", "input.xlsm", "inputs", 15,
                        "80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm", false)));
        when(service.plan(any())).thenReturn(plan);
        mvc.perform(post("/api/test-atlas/plan").contentType("application/json").content(CLIMATIC))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.folder").value("80025 - BMW\\DV\\TEST - 486"))
                .andExpect(jsonPath("$.files[0].relative").value("80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm"))
                .andExpect(jsonPath("$.files[0].conflict").value(false));
        ArgumentCaptor<Conf_TestAtlas> captor = ArgumentCaptor.forClass(Conf_TestAtlas.class);
        verify(service).plan(captor.capture());
        assertEquals("climatic", captor.getValue().testType());
        assertEquals("input.xlsm", captor.getValue().files().get(0).name());
        assertEquals(15L, captor.getValue().files().get(0).size());

        Map<?, ?> spec = new Yaml().load(Files.readString(Path.of("openapi.yaml")));
        Map<?, ?> paths = (Map<?, ?>) spec.get("paths");
        assertEquals("planTestAtlas", ((Map<?, ?>) ((Map<?, ?>) paths.get("/api/test-atlas/plan")).get("post")).get("operationId"));
        Map<?, ?> schemas = (Map<?, ?>) ((Map<?, ?>) spec.get("components")).get("schemas");
        assertEquals(List.of("testType", "programNumber", "programName", "phase"),
                ((Map<?, ?>) schemas.get("TestAtlasConfig")).get("required"));
    }

    @Test
    void failuresKeepTheOriginalStatusAndAUserFacingMessage() throws Exception {
        when(service.plan(any())).thenThrow(new TestAtlasException(
                "The evidence folders of this test changed in the repository. Open Test evidence again to reload them.", 409));
        mvc.perform(post("/api/test-atlas/plan").contentType("application/json").content(CLIMATIC))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "The evidence folders of this test changed in the repository. Open Test evidence again to reload them."));
        when(service.suggestions(any(), any(), any(), any())).thenThrow(new TestAtlasException("Enter a valid program."));
        mvc.perform(get("/api/test-atlas/suggestions").param("program", ".."))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"message\":\"Enter a valid program.\"}"));
        mvc.perform(post("/api/test-atlas/plan").contentType("application/json").content("{"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadsStreamTheRawBodyIntoTheStagingFile() throws Exception {
        when(service.createUpload(any())).thenReturn(new TestAtlasUploadDto("11111111-2222-4333-8444-555555555555"));
        mvc.perform(post("/api/test-atlas/uploads").contentType("application/json").content(CLIMATIC))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"id\":\"11111111-2222-4333-8444-555555555555\"}"));

        byte[][] received = new byte[1][];
        doAnswer(invocation -> {
            received[0] = ((InputStream) invocation.getArgument(2)).readAllBytes();
            return null;
        }).when(service).storeFile(eq("11111111-2222-4333-8444-555555555555"), eq("00000000-0000-4000-8000-000000000001"), any());
        mvc.perform(post("/api/test-atlas/uploads/11111111-2222-4333-8444-555555555555/files/00000000-0000-4000-8000-000000000001")
                        .contentType("application/octet-stream").content("fixture content".getBytes()))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"ok\":true}"));
        assertEquals("fixture content", new String(received[0]));

        doThrow(new TestAtlasException("Upload size differs from review.")).when(service).storeFile(any(), any(), any());
        mvc.perform(post("/api/test-atlas/uploads/11111111-2222-4333-8444-555555555555/files/00000000-0000-4000-8000-000000000001")
                        .contentType("application/octet-stream").content("x".getBytes()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Upload size differs from review."));

        mvc.perform(post("/api/test-atlas/uploads/11111111-2222-4333-8444-555555555555/cancel"))
                .andExpect(status().isOk());
        verify(service).cancelUpload("11111111-2222-4333-8444-555555555555");
    }

    @Test
    void lookupsForwardQueryParametersAndServePhotos(@TempDir Path temp) throws Exception {
        when(service.suggestions("vibration", "ejem", "0000_Ejemplo", "01_DV")).thenReturn(new TestAtlasSuggestionsDto(
                List.of(new TestAtlasSuggestionsDto.ProgramSuggestionDto("0000", "Ejemplo", "0000_Ejemplo")),
                List.of("01_DV"), List.of(), List.of("01_Tanda_Validacion")));
        mvc.perform(get("/api/test-atlas/suggestions").param("testType", "vibration").param("q", "ejem")
                        .param("program", "0000_Ejemplo").param("phase", "01_DV"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.programs[0].folder").value("0000_Ejemplo"))
                .andExpect(jsonPath("$.batches[0]").value("01_Tanda_Validacion"));

        when(service.existingInputs("90001", "Audi", "PV", "512")).thenReturn(new TestAtlasWorkbooksDto(List.of("261006_CL_Inputs_Audi_PV_512.xlsx")));
        mvc.perform(get("/api/test-atlas/climatic/existing-inputs").param("programNumber", "90001")
                        .param("programName", "Audi").param("phase", "PV").param("testNumber", "512"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"workbooks\":[\"261006_CL_Inputs_Audi_PV_512.xlsx\"]}"));

        Path photo = Files.write(temp.resolve("261008_Evidence_01.jpg"), new byte[] {(byte) 0xFF, (byte) 0xD8, 1, 2});
        when(service.evidencePhoto("70010", "Volvo", "DV", "77", "02_Incident", "261008_Evidence_01.jpg"))
                .thenReturn(new EvidencePhoto(photo, "image/jpeg"));
        mvc.perform(get("/api/test-atlas/climatic/evidence-photo").param("programNumber", "70010")
                        .param("programName", "Volvo").param("phase", "DV").param("testNumber", "77")
                        .param("folder", "02_Incident").param("name", "261008_Evidence_01.jpg"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/jpeg"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(new byte[] {(byte) 0xFF, (byte) 0xD8, 1, 2}));

        when(service.evidencePhoto(any(), any(), any(), any(), any(), any()))
                .thenThrow(new TestAtlasException("Not found.", 404));
        mvc.perform(get("/api/test-atlas/climatic/evidence-photo").param("programNumber", "70010")
                        .param("programName", "Volvo").param("phase", "DV").param("testNumber", "77")
                        .param("folder", "02_Incident").param("name", "evidence.json"))
                .andExpect(status().isNotFound());
    }
}
