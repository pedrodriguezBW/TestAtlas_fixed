import { useSyncExternalStore } from 'react'
import type { TestAtlasResult } from '../testAtlasModel'

// Progress of the save started by the Toolbox Run button. The strategy's
// execute() publishes it here so the Test Atlas screen can show the original
// full-screen loading panel, the save progress line and the success card.

export interface LoadingContent {
    title: string
    detail: string
    /** 0..1, or null for the indeterminate bar. */
    progress: number | null
    count: string
}

export type RunState =
    | { status: 'idle' }
    | { status: 'running'; loading: LoadingContent; message: string }
    | { status: 'done'; result: TestAtlasResult }
    | { status: 'failed'; error: string }

let state: RunState = { status: 'idle' }
const listeners = new Set<() => void>()

export const getRunState = (): RunState => state

export const setRunState = (next: RunState): void => {
    state = next
    listeners.forEach((listener) => listener())
}

export const resetRunState = (): void => {
    if (state.status !== 'idle') setRunState({ status: 'idle' })
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export const useRunState = (): RunState => useSyncExternalStore(subscribe, getRunState, getRunState)
