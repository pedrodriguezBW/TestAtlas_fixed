// src/algorithms/streamJson.ts
import type { ExecuteOptions } from './types'
import { apiUrl } from './apiUrl'

type Message<T> =
    | { type: 'progress'; current: number; total: number; message?: string }
    | { type: 'result'; data: T }
    | { type: 'error'; message: string }

export const streamJson = async <T,>(
    url: string,
    body: unknown,
    opts?: ExecuteOptions
): Promise<T> => {
    const response = await fetch(apiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts?.signal,
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Backend returned ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    if (!response.body) throw new Error('Response has no body to stream')

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let result: T | undefined
    let settled = false

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += value
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''        // incomplete trailing line stays buffered

            for (const line of lines) {
                if (!line.trim()) continue
                const msg = JSON.parse(line) as Message<T>

                if (msg.type === 'progress') {
                    opts?.onProgress?.({ current: msg.current, total: msg.total, message: msg.message })
                } else if (msg.type === 'result') {
                    result = msg.data
                    settled = true
                } else if (msg.type === 'error') {
                    throw new Error(msg.message)
                }
            }
        }
        if (buffer.trim()) {                // stream ended without a trailing newline
            const msg = JSON.parse(buffer) as Message<T>
            if (msg.type === 'result') { result = msg.data; settled = true }
            else if (msg.type === 'error') throw new Error(msg.message)
        }
    } finally {
        reader.releaseLock()
    }

    if (!settled) throw new Error('Stream ended before a result was received')
    return result as T
}