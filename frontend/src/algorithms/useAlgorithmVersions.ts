import { useEffect, useState } from 'react'
import { fetchAlgorithmVersions } from './algorithmVersions'

export function useAlgorithmVersions() {
    const [versions, setVersions] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        fetchAlgorithmVersions(controller.signal).then((result) => {
            if (!controller.signal.aborted) setVersions(result)
        }).catch(() => {
            if (!controller.signal.aborted) setError('Algorithm versions are unavailable.')
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false)
        })
        return () => controller.abort()
    }, [attempt])

    const retry = () => {
        setLoading(true)
        setError(null)
        setAttempt((current) => current + 1)
    }

    return { versions, loading, error, retry }
}