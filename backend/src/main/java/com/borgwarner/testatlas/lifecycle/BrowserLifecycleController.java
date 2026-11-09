package com.borgwarner.testatlas.lifecycle;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lifecycle")
public class BrowserLifecycleController {

    private final BrowserLifecycleService lifecycleService;

    public BrowserLifecycleController(
            BrowserLifecycleService lifecycleService) {

        this.lifecycleService = lifecycleService;
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<Map<String, Boolean>> heartbeat(
            @RequestBody String sessionId) {

        lifecycleService.heartbeat(sessionId);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("ok", true));
    }

    @PostMapping("/close")
    public ResponseEntity<Void> close(
            @RequestBody String sessionId) {

        lifecycleService.requestClose(sessionId);

        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .build();
    }
}