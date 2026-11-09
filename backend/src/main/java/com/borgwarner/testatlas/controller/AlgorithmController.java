/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.borgwarner.testatlas.controller;

import com.borgwarner.testatlas.algorithm.interfaces.I_OutputData;
import com.borgwarner.testatlas.algorithm.interfaces.I_ProgressListener;
import com.borgwarner.testatlas.service.AlgorithmService;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.Map;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;


/**
 *
 * @author adperez
 */


@RestController
@RequestMapping("/api/scripts")
public class AlgorithmController {

    private final AlgorithmService algorithmService;
    private final ObjectMapper mapper;

    public AlgorithmController(AlgorithmService algorithmService, ObjectMapper mapper) {
        this.algorithmService = algorithmService;
        this.mapper = mapper;
    }

    @GetMapping
    public Set<String> list() {
        return algorithmService.listAlgorithmKeys();
    }

    @GetMapping("/versions")
    public Map<String, String> versions() {
        return algorithmService.listAlgorithmVersions();
    }

    @PostMapping(value = "/{key}", produces = "application/x-ndjson")
    public StreamingResponseBody run(
            @PathVariable String key,
            @RequestBody JsonNode body,
            HttpServletResponse response) {
        response.setContentType("application/x-ndjson");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("X-Content-Type-Options", "nosniff");

        return out -> {
            Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);

            I_ProgressListener progress = (current, total, message) -> {
                try {
                    write(writer, response, new ProgressMessage(current, total, message));
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            };

            try {
                algorithmService.run(key, body, progress, result -> {
                    try {
                        write(writer, response, new ResultMessage(result));
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });
            } catch (Exception e) {
                try {
                    write(writer, response, new ErrorMessage(describe(e)));
                } catch (IOException ignored) {
                    // client already disconnected; nothing left to notify
                }
            }
        };
    }

    private void write(Writer writer, HttpServletResponse response, Object message) throws IOException {
        writer.write(mapper.writeValueAsString(message));
        writer.write("\n");
        writer.flush();
        response.flushBuffer();
    }

    private String describe(Throwable e) {
        if (e instanceof UncheckedIOException) return "Connection closed";
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }

    private record ProgressMessage(String type, int current, int total, String message) {
        ProgressMessage(int current, int total, String message) {
            this("progress", current, total, message);
        }
    }

    private record ResultMessage(String type, Object data) {
        ResultMessage(Object data) {
            this("result", data);
        }
    }

    private record ErrorMessage(String type, String message) {
        ErrorMessage(String message) {
            this("error", message);
        }
    }
}