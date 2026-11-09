package com.borgwarner.testatlas.controller;

import com.borgwarner.testatlas.algorithm.impl.testatlas.Conf_TestAtlas;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasException;
import com.borgwarner.testatlas.algorithm.impl.testatlas.TestAtlasRepositoryReader.EvidencePhoto;
import com.borgwarner.testatlas.service.TestAtlasService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Auxiliary endpoints of the Test Atlas tool, used by its form before the
 * {@code TEST_ATLAS} algorithm runs: review of the save plan, staging upload of
 * the reviewed files (one raw request body per file, so contents never travel
 * inside JSON) and read-only lookups of the project repository. Every response
 * is JSON and non-cacheable; failures carry {@code {"message": ...}} with the
 * status of the original Test Atlas (400, 403, 404 or 409).
 */
@RestController
@RequestMapping("/api/test-atlas")
public class TestAtlasController {

    private final TestAtlasService service;

    public TestAtlasController(TestAtlasService service) {
        this.service = service;
    }

    @PostMapping("/plan")
    public ResponseEntity<?> plan(@RequestBody Conf_TestAtlas request) {
        return ok(service.plan(request));
    }

    @PostMapping("/uploads")
    public ResponseEntity<?> createUpload(@RequestBody Conf_TestAtlas request) {
        return ok(service.createUpload(request));
    }

    @PostMapping("/uploads/{uploadId}/files/{fileId}")
    public ResponseEntity<?> uploadFile(
            @PathVariable String uploadId,
            @PathVariable String fileId,
            HttpServletRequest request) throws IOException {
        service.storeFile(uploadId, fileId, request.getInputStream());
        return ok(Map.of("ok", true));
    }

    @PostMapping("/uploads/{uploadId}/cancel")
    public ResponseEntity<?> cancelUpload(@PathVariable String uploadId) {
        service.cancelUpload(uploadId);
        return ok(Map.of("ok", true));
    }

    @GetMapping("/suggestions")
    public ResponseEntity<?> suggestions(
            @RequestParam(required = false) String testType,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String program,
            @RequestParam(required = false) String phase) {
        return ok(service.suggestions(testType, q, program, phase));
    }

    @GetMapping("/climatic/existing-inputs")
    public ResponseEntity<?> existingInputs(
            @RequestParam(required = false) String programNumber,
            @RequestParam(required = false) String programName,
            @RequestParam(required = false) String phase,
            @RequestParam(required = false) String testNumber) {
        return ok(service.existingInputs(programNumber, programName, phase, testNumber));
    }

    @GetMapping("/climatic/test-state")
    public ResponseEntity<?> testState(
            @RequestParam(required = false) String programNumber,
            @RequestParam(required = false) String programName,
            @RequestParam(required = false) String phase,
            @RequestParam(required = false) String testNumber) {
        return ok(service.testState(programNumber, programName, phase, testNumber));
    }

    @GetMapping("/climatic/evidence-photo")
    public ResponseEntity<?> evidencePhoto(
            @RequestParam(required = false) String programNumber,
            @RequestParam(required = false) String programName,
            @RequestParam(required = false) String phase,
            @RequestParam(required = false) String testNumber,
            @RequestParam(required = false) String folder,
            @RequestParam(required = false) String name) throws IOException {
        EvidencePhoto photo = service.evidencePhoto(programNumber, programName, phase, testNumber, folder, name);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .body(Files.readAllBytes(photo.path()));
    }

    @GetMapping("/vibration/sample-inputs")
    public ResponseEntity<?> sampleInputs(
            @RequestParam(required = false) String programNumber,
            @RequestParam(required = false) String programName,
            @RequestParam(required = false) String phase,
            @RequestParam(required = false) String batchName,
            @RequestParam(required = false) String testCode,
            @RequestParam(required = false) String testType,
            @RequestParam(required = false) String axis,
            @RequestParam(required = false) String materialMasterCode) {
        return ok(service.sampleInputs(
                programNumber, programName, phase, batchName, testCode, testType, axis, materialMasterCode));
    }

    @ExceptionHandler(TestAtlasException.class)
    public ResponseEntity<Map<String, String>> testAtlasFailure(TestAtlasException failure) {
        return error(failure.status(), failure.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalidRequest(IllegalArgumentException failure) {
        return error(400, failure.getMessage() == null ? "Invalid request." : failure.getMessage());
    }

    @ExceptionHandler({IOException.class, UncheckedIOException.class})
    public ResponseEntity<Map<String, String>> repositoryFailure(Exception failure) {
        Throwable cause = failure instanceof UncheckedIOException unchecked ? unchecked.getCause() : failure;
        if (cause instanceof AccessDeniedException denied) {
            return error(403, "Windows denied access to the project repository. Blocked path: " + denied.getFile() + ".");
        }
        return error(500, "Server error: " + (cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage()));
    }

    private static ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static ResponseEntity<Map<String, String>> error(int status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("message", message));
    }
}
