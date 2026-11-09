package com.borgwarner.testatlas.dto;

import java.util.List;

/**
 * Everything already saved for a climatic test: inputs workbooks, whether
 * {@code test_metadata.json} exists and every evidence folder with its photos.
 */
public record TestAtlasTestStateDto(
        List<String> workbooks,
        boolean metadataExists,
        List<SavedEvidenceDto> evidence) {

    public record SavedEvidenceDto(
            String folder,
            String type,
            String title,
            String referenceType,
            String referenceValue,
            String notes,
            List<SavedPhotoDto> photos) {
    }

    public record SavedPhotoDto(
            String name,
            String originalName,
            long size,
            String captureDate,
            String dateSource,
            boolean preview) {
    }
}
