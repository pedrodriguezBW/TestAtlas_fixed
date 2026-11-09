package com.borgwarner.testatlas.controller;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.borgwarner.testatlas.TestAtlasApplication;
import com.borgwarner.testatlas.algorithm.interfaces.I_OutputData;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import com.borgwarner.testatlas.config.FrontendCorsConfiguration;
import com.borgwarner.testatlas.service.AlgorithmService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Generic algorithm endpoint used by the Test Atlas Run (ported from the
 * Engineering Toolbox AlgorithmControllerTest, restricted to TEST_ATLAS).
 */
@WebMvcTest(AlgorithmController.class)
@ContextConfiguration(classes = TestAtlasApplication.class)
@Import(FrontendCorsConfiguration.class)
class AlgorithmControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper jsonMapper;
    @MockitoBean private AlgorithmService algorithmService;

    @Test
    void returnsBackendVersionsMatchingTheOpenApiContract() throws Exception {
        when(algorithmService.listAlgorithmVersions()).thenReturn(Map.of("TEST_ATLAS", "1.0"));
        MvcResult result = mvc.perform(get("/api/scripts/versions"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(content().json("{\"TEST_ATLAS\":\"1.0\"}"))
                .andReturn();
        Map<?, ?> specification = new Yaml().load(Files.readString(Path.of("openapi.yaml")));
        Map<?, ?> paths = (Map<?, ?>) specification.get("paths");
        Map<?, ?> operation = (Map<?, ?>) ((Map<?, ?>) paths.get("/api/scripts/versions")).get("get");
        Map<?, ?> response = (Map<?, ?>) ((Map<?, ?>) operation.get("responses")).get("200");
        Map<?, ?> media = (Map<?, ?>) ((Map<?, ?>) response.get("content")).get("application/json");
        Map<?, ?> schema = (Map<?, ?>) media.get("schema");
        assertEquals("object", schema.get("type"));
        Map<?, ?> valueSchema = (Map<?, ?>) schema.get("additionalProperties");
        JsonNode versions = jsonMapper.readTree(result.getResponse().getContentAsString());
        for (String key : versions.propertyNames()) {
            assertTrue(versions.get(key).isString());
            assertTrue(versions.get(key).asString().length() >= ((Number) valueSchema.get("minLength")).intValue());
            assertTrue(versions.get(key).asString().length() <= ((Number) valueSchema.get("maxLength")).intValue());
        }
        verify(algorithmService).listAlgorithmVersions();
    }

    @Test
    void unconfiguredFrontendOriginsAreRejected() throws Exception {
        mvc.perform(get("/api/scripts").header("Origin", "http://toolbox.example:28001"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void directBrowserPreflightAllowsLocalDevelopment() throws Exception {
        when(algorithmService.listAlgorithmKeys()).thenReturn(Set.of("TEST_ATLAS"));
        mvc.perform(options("/api/scripts/TEST_ATLAS")
                .header("Origin", "http://localhost:18000")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:18000"))
                .andExpect(header().string("Access-Control-Allow-Methods", "GET,POST"));
        mvc.perform(get("/api/scripts").header("Origin", "http://127.0.0.1:18000"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:18000"))
                .andExpect(content().json("[\"TEST_ATLAS\"]"));
    }

    @Test
    void testAtlasRunStreamsTheResultWithTheLongRunningTimeout() throws Exception {
        when(algorithmService.run(eq("TEST_ATLAS"), any(JsonNode.class), any(I_ProgressListener.class), any()))
                .thenAnswer(invocation -> deliverResult(invocation, new TestOutput("done")));

        MvcResult pending = mvc.perform(post("/api/scripts/TEST_ATLAS")
                .contentType("application/json").content("{}"))
                .andExpect(request().asyncStarted()).andReturn();

        assertEquals(1_800_000L, pending.getRequest().getAsyncContext().getTimeout());
        mvc.perform(asyncDispatch(pending)).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/x-ndjson"))
                .andExpect(content().json("{\"type\":\"result\",\"data\":{\"value\":\"done\"}}"));
    }

    @Test
    void failuresKeepTheNdjsonErrorContract() throws Exception {
        when(algorithmService.run(eq("TEST_ATLAS"), any(JsonNode.class), any(I_ProgressListener.class), any()))
                .thenThrow(new IllegalArgumentException("Invalid destination."));

        MvcResult pending = mvc.perform(post("/api/scripts/TEST_ATLAS")
                .contentType("application/json").content("{}"))
                .andExpect(request().asyncStarted()).andReturn();
        mvc.perform(asyncDispatch(pending)).andExpect(status().isOk())
                .andExpect(content().json("{\"type\":\"error\",\"message\":\"Invalid destination.\"}"));
    }

    @Test
    void flushesEveryProgressMessageToTheClient() throws Exception {
        AlgorithmService service = mock(AlgorithmService.class);
        ObjectMapper mapper = new ObjectMapper();
        AlgorithmController controller = new AlgorithmController(service, mapper);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JsonNode request = mapper.readTree("{}");
        when(service.run(eq("TEST_ATLAS"), same(request), any(I_ProgressListener.class), any()))
                .thenAnswer(invocation -> {
                    I_ProgressListener progress = invocation.getArgument(2);
                    progress.report(1, 3, "Uploading a");
                    progress.report(2, 3, "Uploading b");
                    progress.report(3, 3, "Saving");
                    return deliverResult(invocation, new TestOutput("done"));
                });
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        controller.run("TEST_ATLAS", request, response).writeTo(output);

        String ndjson = output.toString(UTF_8);
        assertEquals(4, ndjson.lines().count());
        assertTrue(ndjson.contains("\"current\":1,\"total\":3"));
        assertTrue(ndjson.contains("\"current\":3,\"total\":3"));
        verify(response, times(4)).flushBuffer();
    }

    private I_OutputData deliverResult(InvocationOnMock invocation, I_OutputData output) {
        Consumer<I_OutputData> delivery = invocation.getArgument(3);
        delivery.accept(output);
        return output;
    }

    private record TestOutput(String value) implements I_OutputData {
    }
}
