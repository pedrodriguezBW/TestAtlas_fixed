import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl } from './apiUrl'

describe('API destination', () => {
    afterEach(() => vi.unstubAllEnvs())

    it('keeps local requests relative when no backend URL is configured', () => {
        vi.stubEnv('VITE_BACKEND_URL', '')
        expect(apiUrl('/api/scripts/EXPORT_TEAMCENTER_BOM')).toBe('/api/scripts/EXPORT_TEAMCENTER_BOM')
    })

    it.each(['/api/scripts/EXPORT_TEAMCENTER_BOM', '/api/polarion/test-runs/search', '/api/variants/projects', '/api/variants/PROJECT%20ID'])
    ('routes %s to the configured backend', path => {
        vi.stubEnv('VITE_BACKEND_URL', 'http://backend.example:17000/')
        expect(apiUrl(path)).toBe('http://backend.example:17000' + path)
    })
})