import { apiUrl } from './apiUrl'

export async function fetchAlgorithmVersions(signal: AbortSignal): Promise<Record<string, string>> {
    const response = await fetch(apiUrl('/api/scripts/versions'), { signal })
    if (!response.ok) throw new Error('Could not load algorithm versions.')
    const versions: unknown = await response.json()
    if (versions === null || typeof versions !== 'object' || Array.isArray(versions)
        || Object.values(versions).some((value) => typeof value !== 'string' || !value.trim() || value.length > 100)) {
        throw new Error('Invalid algorithm versions response.')
    }
    return versions as Record<string, string>
}