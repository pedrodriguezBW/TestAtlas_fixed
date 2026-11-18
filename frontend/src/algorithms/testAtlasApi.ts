import { apiUrl } from './apiUrl'
import type { TestAtlasManifest, TestAtlasPlan, TestAtlasTestState } from './impl/testAtlasModel'

// Auxiliary Test Atlas endpoints used by the form before the TEST_ATLAS run:
// review of the plan, staging upload of the files and repository lookups.
// Failures carry the server's user-facing message.

export interface TestDetails {
    programNumber: string
    programName: string
    phase: string
    testNumber: string
}

export interface TestAtlasSuggestions {
    programs: Array<{ number: string; name: string; folder: string }>
    phases: string[]
    tests: string[]
    batches: string[]
}

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const response = await fetch(apiUrl(path), { ...init, signal })
    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : `Backend returned ${response.status}`
        throw new Error(message)
    }
    return response.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
})

const detailsQuery = (details: TestDetails) => new URLSearchParams({
    programNumber: details.programNumber.trim(),
    programName: details.programName.trim(),
    phase: details.phase.trim(),
    testNumber: details.testNumber.trim(),
})

/** Validate the manifest and get the planned tree, names and conflicts. Nothing is written. */
export const planTestAtlas = (manifest: TestAtlasManifest, signal?: AbortSignal) =>
    request<TestAtlasPlan>('/api/test-atlas/plan', json(manifest), signal)

/** Open a staging upload for the files of the manifest. */
export const createTestAtlasUpload = (manifest: TestAtlasManifest, signal?: AbortSignal) =>
    request<{ id: string }>('/api/test-atlas/uploads', json(manifest), signal)

/**
 * Stream one file into the staging upload; the byte count must match the manifest.
 * XMLHttpRequest is used, like the original Test Atlas, because fetch cannot
 * report upload progress: onProgress receives the bytes sent so far.
 */
export const uploadTestAtlasFile = (
    uploadId: string,
    fileId: string,
    file: Blob,
    onProgress?: (loaded: number) => void,
    signal?: AbortSignal,
): Promise<{ ok: boolean }> => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    request.open('POST', apiUrl(`/api/test-atlas/uploads/${uploadId}/files/${fileId}`))
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.upload?.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded)
    })
    request.addEventListener('load', () => {
        signal?.removeEventListener('abort', abort)
        let body: unknown = null
        try {
            body = JSON.parse(request.responseText || 'null')
        } catch {
            body = null
        }
        if (request.status >= 200 && request.status < 300) {
            onProgress?.(file.size)
            resolve((body ?? { ok: true }) as { ok: boolean })
        } else {
            const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
                ? body.message
                : `Backend returned ${request.status}`
            reject(new Error(message))
        }
    })
    request.addEventListener('error', () => {
        signal?.removeEventListener('abort', abort)
        reject(new Error('The connection to the Test Atlas server was lost while uploading.'))
    })
    request.addEventListener('abort', () => {
        signal?.removeEventListener('abort', abort)
        reject(new DOMException('The upload was cancelled.', 'AbortError'))
    })
    if (signal?.aborted) {
        reject(new DOMException('The upload was cancelled.', 'AbortError'))
        return
    }
    signal?.addEventListener('abort', abort)
    request.send(file)
})

export const cancelTestAtlasUpload = (uploadId: string) =>
    request<{ ok: boolean }>(`/api/test-atlas/uploads/${uploadId}/cancel`, { method: 'POST' })

/** Workbooks, metadata presence and saved evidence checkpoints of a climatic test. */
export const fetchTestAtlasTestState = (details: TestDetails, signal?: AbortSignal) =>
    request<TestAtlasTestState>(`/api/test-atlas/climatic/test-state?${detailsQuery(details)}`, { method: 'GET' }, signal)

/** Program, phase and test names already present in the repository. */
export const fetchTestAtlasSuggestions = (query: { q: string; program?: string; phase?: string; testType?: 'climatic' | 'vibration' }, signal?: AbortSignal) => {
    const params = new URLSearchParams({ testType: query.testType ?? 'climatic', q: query.q })
    if (query.program) params.set('program', query.program)
    if (query.phase) params.set('phase', query.phase)
    return request<TestAtlasSuggestions>(`/api/test-atlas/suggestions?${params}`, { method: 'GET' }, signal)
}

export interface VibrationSampleDetails {
    programNumber: string
    programName: string
    phase: string
    batchName: string
    testCode: string
    testType: string
    axis: string
    materialMasterCode: string
}

/** Inputs workbooks already saved directly in a vibration Material Master folder. */
export const fetchVibrationSampleInputs = (details: VibrationSampleDetails, signal?: AbortSignal) => {
    const params = new URLSearchParams(Object.entries(details).map(([key, value]) => [key, value.trim()]))
    return request<{ workbooks: string[] }>(`/api/test-atlas/vibration/sample-inputs?${params}`, { method: 'GET' }, signal)
}

/** Thumbnail URL of a photo already saved in an evidence folder. */
export const evidencePhotoUrl = (details: TestDetails, folder: string, name: string): string =>
    apiUrl(`/api/test-atlas/climatic/evidence-photo?${detailsQuery(details)}&${new URLSearchParams({ folder, name })}`)
