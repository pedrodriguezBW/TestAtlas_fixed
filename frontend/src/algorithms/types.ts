// src/algorithms/types.ts
import type { ComponentType } from 'react'

export const AlgorithmPlatform = {
    Jira: 'JIRA',
    Polarion: 'POLARION',
    SharePoint: 'SHAREPOINT',
    TeamCenter: 'TEAMCENTER',
    FileRepository: 'FILE_REPOSITORY',
} as const
export type AlgorithmPlatform = typeof AlgorithmPlatform[keyof typeof AlgorithmPlatform]

export const AlgorithmRole = {
    Anyone: 'ANYONE',
    Admin: 'ADMIN',
} as const
export type AlgorithmRole = typeof AlgorithmRole[keyof typeof AlgorithmRole]

export const AlgorithmTag = {
    Timings: 'TIMINGS',
    Wbs: 'WBS',
    WorkItemConfiguration: 'WORK_ITEM_CONFIGURATION',
    Documentation: 'DOCUMENTATION',
    LogAnalysis: 'LOG_ANALYSIS',
    TestManagement: 'TEST_MANAGEMENT',
} as const
export type AlgorithmTag = typeof AlgorithmTag[keyof typeof AlgorithmTag]

export interface AlgorithmStrategy<V = any, T = any> {
    /** discriminator — the registry key */
    id: string
    label: string
    description: string
    emptyConfig: () => V
    InputForm: ComponentType<AlgorithmInputProps<V>>
    OutputView: ComponentType<AlgorithmOutputProps<V, T>>
    execute: (v: V, opts?: ExecuteOptions) => Promise<T>
    validate?: (v: V) => string[]
    order?: number
    platforms?: readonly AlgorithmPlatform[] | null
    roles?: readonly AlgorithmRole[] | null
    tags?: readonly AlgorithmTag[] | null
}

export interface Progress {
    current: number
    total: number
    message?: string
}

export interface ExecuteOptions {
    onProgress?: (p: Progress) => void
    signal?: AbortSignal
}

export interface AlgorithmInputProps<V> {
    value: V
    onChange: (v: V) => void
    disabled?: boolean
}

export interface AlgorithmOutputProps<V, T> {
    result: T
    config: V
}