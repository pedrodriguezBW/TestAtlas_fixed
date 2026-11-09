package com.borgwarner.testatlas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Browser origins allowed to call the API directly (static frontend hosting with
 * VITE_BACKEND_URL). Local development through the Vite proxy is same-origin and
 * does not need CORS. Override with {@code testatlas.frontend-origins} or the
 * {@code TESTATLAS_FRONTEND_ORIGINS} environment variable (comma-separated).
 */
@Configuration
public class FrontendCorsConfiguration implements WebMvcConfigurer {
    @Value("${testatlas.frontend-origins:http://localhost:18000,http://127.0.0.1:18000}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST")
                .allowedHeaders("Content-Type");
    }
}
