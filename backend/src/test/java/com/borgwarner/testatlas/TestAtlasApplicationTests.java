package com.borgwarner.testatlas;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.borgwarner.testatlas.service.AlgorithmService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Full context test of the standalone backend. It needs no database or external
 * service: the repository and staging roots point to temporary folders in the
 * {@code test} profile.
 */
@SpringBootTest(classes = TestAtlasApplication.class)
@ActiveProfiles("test")
class TestAtlasApplicationTests {

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private AlgorithmService algorithmService;

	@Test
	void onlyTestAtlasIsRegisteredWithItsBackendVersion() {
		assertEquals(Map.of("TEST_ATLAS", "1.0"), algorithmService.listAlgorithmVersions());
		assertEquals(algorithmService.listAlgorithmKeys(), algorithmService.listAlgorithmVersions().keySet());
	}

	@Test
	void contextLoads() {
	}

	@Test
	void springObjectMapperDeserializesControllerJsonNode() throws Exception {
		JsonNode body = objectMapper.readTree("""
				{"testType":"climatic","files":[{"id":"a","name":"input.xlsm","size":15}]}
				""");

		assertEquals("input.xlsm", body.get("files").get(0).get("name").asText());
	}

}
