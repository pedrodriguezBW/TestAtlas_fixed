/// <reference types="node" />
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import testAtlas from './TestAtlas.algorithm'
import { planTreeText } from './testAtlas/planTree'
import { getRunState, resetRunState } from './testAtlas/runState'
import { captureDate, exifDate, localIso } from './testAtlasCaptureDate'
import {
    buildManifest,
    emptyTestAtlasConfig,
    evidenceFolderName,
    manifestKey,
    mergeSavedEvidence,
    registerFile,
    suggestedEvidenceTitle,
    validPart,
    type EvidenceSetConfig,
    type TestAtlasConfig,
    type TestAtlasPlan,
} from './testAtlasModel'

const STEPS_PENDING = 'Complete the Test Atlas steps and review the files before saving.'
const UPLOAD_ID = '11111111-2222-4333-8444-555555555555'

const evidence = (type: EvidenceSetConfig['type'], title: string, extra: Partial<EvidenceSetConfig> = {}): EvidenceSetConfig => ({
    id: crypto.randomUUID(), type, title, referenceType: 'none', referenceValue: '', notes: '', existingFolder: '', savedPhotos: [], photos: [], ...extra,
})

/** A complete climatic configuration with one registered inputs workbook. */
const completeConfig = (): TestAtlasConfig => {
    const inputs = registerFile(new File(['xlsx'], 'input.xlsm', { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }))
    return {
        ...emptyTestAtlasConfig(),
        testType: 'climatic',
        step: 5,
        maxStep: 5,
        programNumber: '80025',
        programName: 'BMW',
        phase: 'DV',
        testNumber: '486',
        date: '260930',
        files: [{ ...inputs, category: 'inputs' }],
        evidenceSets: [evidence('initial', 'Initial condition'), evidence('final', 'Final condition')],
    }
}

const plan = (config: TestAtlasConfig, conflict = false): TestAtlasPlan => ({
    root: 'C:\\Proyectos',
    folder: '80025 - BMW\\DV\\TEST - 486',
    directories: ['80025 - BMW\\DV\\TEST - 486', '80025 - BMW\\DV\\TEST - 486\\01_Inputs', '80025 - BMW\\DV\\TEST - 486\\02_Evidences'],
    existingWorkbooks: [],
    generatedFiles: ['80025 - BMW\\DV\\TEST - 486\\02_Evidences\\00_Initial\\evidence.json'],
    renamedFolders: [],
    files: [{ id: config.files[0].id, name: 'input.xlsm', category: 'inputs', size: 4, relative: '80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm', conflict }],
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const runResult = {
    folder: '80025 - BMW\\DV\\TEST - 486',
    folderPath: 'C:\\Proyectos\\80025 - BMW\\DV\\TEST - 486',
    saved: ['80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm'],
    directories: ['80025 - BMW\\DV\\TEST - 486', '80025 - BMW\\DV\\TEST - 486\\01_Inputs'],
    generatedFiles: [],
    renamedFolders: [],
}

/** XMLHttpRequest stand-in: the staging upload streams each file with XHR to report progress. */
class FakeXhr {
    static requests: FakeXhr[] = []
    static reply: { status: number; body: string } = { status: 200, body: '{"ok":true}' }
    method = ''
    url = ''
    status = 0
    responseText = ''
    body: unknown = null
    headers: Record<string, string> = {}
    upload = new EventTarget()
    private events = new EventTarget()

    open(method: string, url: string) {
        this.method = method
        this.url = url
    }

    setRequestHeader(name: string, value: string) {
        this.headers[name] = value
    }

    addEventListener(type: string, listener: EventListener) {
        this.events.addEventListener(type, listener)
    }

    removeEventListener(type: string, listener: EventListener) {
        this.events.removeEventListener(type, listener)
    }

    abort() {
        this.events.dispatchEvent(new Event('abort'))
    }

    send(body: Blob) {
        this.body = body
        FakeXhr.requests.push(this)
        setTimeout(() => {
            this.upload.dispatchEvent(Object.assign(new Event('progress'), { lengthComputable: true, loaded: body.size }))
            this.status = FakeXhr.reply.status
            this.responseText = FakeXhr.reply.body
            this.events.dispatchEvent(new Event('load'))
        }, 0)
    }
}

describe('Test Atlas strategy', () => {
    beforeEach(() => {
        FakeXhr.requests = []
        FakeXhr.reply = { status: 200, body: '{"ok":true}' }
        resetRunState()
    })
    afterEach(() => vi.unstubAllGlobals())

    it('is catalogued as a file repository tool for anyone under test management', () => {
        expect(testAtlas.id).toBe('TEST_ATLAS')
        expect(testAtlas.label).toBe('Test Atlas')
        expect(testAtlas.order).toBe(10)
        expect(testAtlas.platforms).toEqual(['FILE_REPOSITORY'])
        expect(testAtlas.roles).toEqual(['ANYONE'])
        expect(testAtlas.tags).toEqual(['TEST_MANAGEMENT'])
    })

    it('keeps the Toolbox Run disabled until the review is fresh, every conflict is decided and the review is confirmed', () => {
        const config = completeConfig()
        expect(testAtlas.validate?.(testAtlas.emptyConfig())).toEqual([STEPS_PENDING])
        expect(testAtlas.validate?.(config)).toEqual([STEPS_PENDING])
        const reviewed = { ...config, review: { key: manifestKey(config), plan: plan(config, true), approved: [] } }
        expect(testAtlas.validate?.(reviewed)).toEqual(['Choose whether to replace 80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm.'])
        const approved = { ...reviewed, review: { ...reviewed.review, approved: [config.files[0].id] } }
        expect(testAtlas.validate?.(approved)).toEqual(['Confirm the review to enable saving.'])
        expect(testAtlas.validate?.({ ...approved, confirmed: true })).toEqual([])
        // Editing the form after the review makes it stale; only the climatic workflow can be saved.
        expect(testAtlas.validate?.({ ...approved, confirmed: true, testNumber: '487' })).toEqual([STEPS_PENDING])
        expect(testAtlas.validate?.({ ...approved, confirmed: true, testType: 'vibration' })).toEqual([STEPS_PENDING])
        expect(testAtlas.validate?.({ ...approved, confirmed: true, step: 4 })).toEqual([STEPS_PENDING])
    })

    it('stages every file with progress, runs the algorithm with the upload id and publishes the result', async () => {
        const config = completeConfig()
        config.review = { key: manifestKey(config), plan: plan(config, true), approved: [config.files[0].id] }
        config.confirmed = true
        const fetchMock = vi.fn(async (url: string) => {
            if (url === '/api/test-atlas/uploads') return json({ id: UPLOAD_ID })
            if (url === '/api/scripts/TEST_ATLAS') {
                return new Response(
                    '{"type":"progress","current":1,"total":2,"message":"Saved 80025 - BMW\\\\DV\\\\TEST - 486\\\\01_Inputs\\\\260930_CL_Inputs_BMW_DV_486.xlsm"}\n'
                    + `{"type":"result","data":${JSON.stringify(runResult)}}\n`,
                    { status: 200 },
                )
            }
            throw new Error(`Unexpected request ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('XMLHttpRequest', FakeXhr)
        const progress = vi.fn()

        const result = await testAtlas.execute(config, { onProgress: progress })

        expect(result.folderPath).toBe('C:\\Proyectos\\80025 - BMW\\DV\\TEST - 486')
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/test-atlas/uploads', '/api/scripts/TEST_ATLAS'])
        expect(FakeXhr.requests.map((request) => [request.method, request.url])).toEqual([
            ['POST', `/api/test-atlas/uploads/${UPLOAD_ID}/files/${config.files[0].id}`],
        ])
        expect(FakeXhr.requests[0].body).toBeInstanceOf(File)
        expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual(buildManifest(config))
        expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({
            ...buildManifest(config),
            uploadId: UPLOAD_ID,
            approvedOverwrites: [config.files[0].id],
        })
        expect(progress).toHaveBeenCalledWith({ current: 0, total: 2, message: 'Uploading input.xlsm' })
        expect(progress).toHaveBeenCalledWith({ current: 1, total: 2, message: 'Saving to the project repository' })
        expect(progress).toHaveBeenCalledWith({ current: 1, total: 2, message: 'Saved 80025 - BMW\\DV\\TEST - 486\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm' })
        expect(getRunState()).toEqual({ status: 'done', result: runResult })
    })

    it('reports the server message, cancels the staging upload and shows the failure in the tool', async () => {
        const config = completeConfig()
        const fetchMock = vi.fn(async (url: string) => {
            if (url === '/api/test-atlas/uploads') return json({ id: UPLOAD_ID })
            return json({ ok: true })
        })
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('XMLHttpRequest', FakeXhr)
        FakeXhr.reply = { status: 400, body: '{"message":"Upload size differs from review."}' }

        await expect(testAtlas.execute(config)).rejects.toThrow('Upload size differs from review.')
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/test-atlas/uploads/${UPLOAD_ID}/cancel`)
        expect(getRunState()).toEqual({ status: 'failed', error: 'Upload size differs from review.' })
    })
})

describe('Test Atlas naming rules', () => {
    it('mirrors the server folder names for evidence checkpoints', () => {
        expect(evidenceFolderName(evidence('initial', 'x'), 0)).toBe('00_Initial')
        expect(evidenceFolderName(evidence('final', 'x'), 5)).toBe('99_Final')
        expect(evidenceFolderName(evidence('planned_inspection', 'x', { referenceType: 'cycles', referenceValue: '250' }), 1)).toBe('01_Inspection_250Cycles')
        expect(evidenceFolderName(evidence('unplanned_stop', 'x', { referenceType: 'hours', referenceValue: '12.5' }), 2)).toBe('02_UnplannedStop_12.5Hours')
        expect(evidenceFolderName(evidence('incident', 'x', { referenceType: 'stage', referenceValue: 'Cold soak' }), 3)).toBe('03_Incident_Stage-Coldsoak')
        expect(evidenceFolderName(evidence('restart', 'x', { referenceType: 'date_time', referenceValue: '2026-10-01 14-30' }), 4)).toBe('04_Restart_2026-10-0114-30')
        expect(evidenceFolderName(evidence('other', 'x'), 5)).toBe('05_Other')
        expect(evidenceFolderName(evidence('incident', 'x', { existingFolder: '02_Incident' }), 1)).toBe('01_Incident')
    })

    it('suggests titles and validates path components', () => {
        expect(suggestedEvidenceTitle('planned_inspection', 'cycles', '250')).toBe('Inspection after cycle 250')
        expect(suggestedEvidenceTitle('unplanned_stop', 'none', '')).toBe('Unplanned stop')
        expect(suggestedEvidenceTitle('other', 'stage', 'Cold')).toBe('Other evidence at stage Cold')
        expect(validPart('80025 - BMW')).toBe(true)
        for (const invalid of ['', '..', 'a/b', 'CON', 'name.', 'x'.repeat(91), 'a:b']) expect(validPart(invalid)).toBe(false)
    })

    it('merges saved evidence folders after the user-ordered checkpoints and drops stale ones', () => {
        const stale = evidence('restart', 'Restart', { existingFolder: '03_Restart' })
        const withPhotos = evidence('incident', 'Incident', { existingFolder: '04_Incident', photos: [{ id: 'p', name: 'a.jpg', size: 1, mime: 'image/jpeg', captureDate: '2026-10-08T09:00:00', dateSource: 'metadata' }] })
        const fresh = evidence('other', 'Other')
        const saved = [
            { folder: '00_Initial', type: 'initial' as const, title: 'Initial', referenceType: 'none' as const, referenceValue: '', notes: '', photos: [{ name: '261008_Evidence_01.jpg', originalName: 'a.jpg', size: 1, captureDate: '', dateSource: '', preview: true }] },
            { folder: '01_Inspection_100Cycles', type: 'planned_inspection' as const, title: 'Inspection', referenceType: 'cycles' as const, referenceValue: '100', notes: '', photos: [] },
        ]
        const merged = mergeSavedEvidence([evidence('initial', 'Initial condition'), fresh, stale, withPhotos, evidence('final', 'Final condition')], saved, true)
        expect(merged.map((set) => [set.type, set.existingFolder])).toEqual([
            ['initial', '00_Initial'],
            ['planned_inspection', '01_Inspection_100Cycles'],
            ['other', ''],
            ['incident', ''],
            ['final', ''],
        ])
        expect(merged[0].savedPhotos[0].name).toBe('261008_Evidence_01.jpg')
        expect(merged[3].photos).toHaveLength(1)
    })

    it('draws the review tree exactly like the original review card', () => {
        const folder = '80025 - BMW\\DV\\TEST - 701'
        const reviewPlan: TestAtlasPlan = {
            root: '/tmp/ta-repo',
            folder,
            directories: ['', '\\01_Inputs', '\\02_Evidences', '\\02_Evidences\\00_Initial', '\\02_Evidences\\01_Inspection_250Cycles', '\\02_Evidences\\99_Final', '\\03_Data', '\\03_Data\\01_SIMPATI', '\\03_Data\\02_Graphtec', '\\03_Data\\03_CANoe', '\\04_Report'].map((path) => folder + path),
            existingWorkbooks: [],
            generatedFiles: ['00_Initial', '01_Inspection_250Cycles', '99_Final'].map((name) => `${folder}\\02_Evidences\\${name}\\evidence.json`),
            renamedFolders: [],
            files: [
                { id: '1', name: 'inputs.xlsm', category: 'inputs', size: 1092, relative: `${folder}\\01_Inputs\\260930_CL_Inputs_BMW_DV_701.xlsm`, conflict: false },
                { id: '2', name: 'chamber.x03', category: 'simpati', size: 3200, relative: `${folder}\\03_Data\\01_SIMPATI\\chamber.x03`, conflict: false },
                { id: '3', name: 'data.csv', category: 'graphtec', size: 3399, relative: `${folder}\\03_Data\\02_Graphtec\\data.csv`, conflict: false },
                { id: '4', name: 'bus.blf', category: 'canoe', size: 3004, relative: `${folder}\\03_Data\\03_CANoe\\bus.blf`, conflict: false },
                { id: '5', name: 'test_metadata.json', category: 'metadata', size: 35, relative: `${folder}\\04_Report\\test_metadata.json`, conflict: false },
                { id: '6', name: 'before.jpg', category: 'evidence', size: 18192, relative: `${folder}\\02_Evidences\\00_Initial\\260930_Evidence_01.jpg`, conflict: false },
            ],
        }
        // Text rendered by climate-file-organizer for the same plan (#reviewTreeText).
        expect(planTreeText(reviewPlan)).toBe([
            '└── 80025 - BMW',
            '    └── DV',
            '        └── TEST - 701',
            '            ├── 01_Inputs',
            '            │   └── 260930_CL_Inputs_BMW_DV_701.xlsm  ← inputs.xlsm',
            '            ├── 02_Evidences',
            '            │   ├── 00_Initial',
            '            │   │   ├── 260930_Evidence_01.jpg  ← before.jpg',
            '            │   │   └── evidence.json [checkpoint record]',
            '            │   ├── 01_Inspection_250Cycles',
            '            │   │   └── evidence.json [checkpoint record]',
            '            │   └── 99_Final',
            '            │       └── evidence.json [checkpoint record]',
            '            ├── 03_Data',
            '            │   ├── 01_SIMPATI',
            '            │   │   └── chamber.x03',
            '            │   ├── 02_Graphtec',
            '            │   │   └── data.csv',
            '            │   └── 03_CANoe',
            '            │       └── bus.blf',
            '            └── 04_Report',
            '                └── test_metadata.json',
        ].join('\n'))
    })
})

describe('Test Atlas capture dates', () => {
    const exifJpeg = (dateTimeOriginal: string) => {
        const text = new TextEncoder().encode(`${dateTimeOriginal}\0`)
        const tiff = new Uint8Array(8 + 2 + 12 + 4 + text.length)
        const view = new DataView(tiff.buffer)
        tiff.set([0x49, 0x49, 0x2a, 0x00]) // II, 42
        view.setUint32(4, 8, true) // first IFD
        view.setUint16(8, 1, true) // one entry
        view.setUint16(10, 0x9003, true) // DateTimeOriginal
        view.setUint16(12, 2, true) // ASCII
        view.setUint32(14, text.length, true)
        view.setUint32(18, 26, true) // value offset
        view.setUint32(22, 0, true) // next IFD
        tiff.set(text, 26)
        const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
        const length = exif.length + 2
        return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xd9])], 'photo.jpg', { type: 'image/jpeg' })
    }

    it('parses EXIF text and rejects impossible dates', () => {
        expect(exifDate('2026:09:30 10:00:00')).toBe('2026-09-30T10:00:00')
        expect(exifDate('2026-02-30T10:00:00')).toBeNull()
        expect(exifDate('no date')).toBeNull()
    })

    it('reads DateTimeOriginal from a JPEG Exif segment and dates from PNG text chunks', async () => {
        expect(await captureDate(exifJpeg('2026:09:30 10:00:00'))).toBe('2026-09-30T10:00:00')
        const chunk = new TextEncoder().encode('Creation Time\u00002026-10-08 09:00:00')
        const png = new Uint8Array(8 + 12 + chunk.length)
        png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        new DataView(png.buffer).setUint32(8, chunk.length, false)
        png.set([0x74, 0x45, 0x58, 0x74], 12) // tEXt
        png.set(chunk, 16)
        expect(await captureDate(new File([png], 'photo.png', { type: 'image/png' }))).toBe('2026-10-08T09:00:00')
        expect(await captureDate(new File(['<xmp:CreateDate>2026-10-01T14:30:00</xmp:CreateDate>'], 'photo.dng'))).toBe('2026-10-01T14:30:00')
        expect(await captureDate(new File(['plain'], 'photo.jpg'))).toBeNull()
    })

    it('formats the local modified date and ignores invalid timestamps', () => {
        expect(localIso(0)).toBeNull()
        expect(localIso(Number.NaN)).toBeNull()
        expect(localIso(new Date(2026, 9, 8, 9, 5, 7).getTime())).toBe('2026-10-08T09:05:07')
    })
})

describe('Test Atlas styles', () => {
    // Vitest turns every CSS import into an empty module (also with ?raw), so the
    // stylesheet is read from disk, like the Excel template in the Log Jira Hours tests.
    const scopedStyles = readFileSync('src/algorithms/impl/testAtlas/test-atlas.css', 'utf8')

    /** Top-level selectors of every style rule (keyframe steps excluded). */
    const ruleSelectors = (css: string): string[] => {
        const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
        const stack: string[] = []
        const selectors: string[] = []
        let start = 0
        for (let index = 0; index < text.length; index++) {
            const char = text[index]
            if (char === '{') {
                const head = text.slice(start, index).trim()
                if (!head.startsWith('@') && !stack.some((parent) => parent.startsWith('@keyframes'))) {
                    let depth = 0
                    let from = 0
                    for (let position = 0; position <= head.length; position++) {
                        const current = head[position]
                        if (current === '(') depth++
                        else if (current === ')') depth--
                        else if ((current === ',' && depth === 0) || position === head.length) {
                            selectors.push(head.slice(from, position).trim())
                            from = position + 1
                        }
                    }
                }
                stack.push(head)
                start = index + 1
            } else if (char === '}') {
                stack.pop()
                start = index + 1
            } else if (char === ';') {
                start = index + 1
            }
        }
        return selectors
    }

    it('scopes every Test Atlas rule to the tool without relying on stylesheet size', () => {
        const selectors = ruleSelectors(scopedStyles)
        expect(selectors.length).toBeGreaterThan(0)
        expect(selectors.filter((selector) => !/^\.test-atlas(?![\w-])|^\.test-atlas-host(?![\w-])/.test(selector))).toEqual([])
        expect(selectors.filter((selector) => /(^|[\s>+~,(])(html|body|:root)(?![\w-])/.test(selector))).toEqual([])
    })

    it('prefixes the original animations so they cannot collide with the Toolbox', () => {
        const names = [...scopedStyles.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1])
        expect(names.length > 5).toBe(true)
        expect(names.filter((name) => !name.startsWith('ta-'))).toEqual([])
    })

    it('uses concrete corporate tokens so primary controls cannot become transparent through variable cycles', () => {
        expect(scopedStyles).toContain('--ta-blue: #1257a6')
        expect(scopedStyles).toContain('--ta-ink: #17233a')
        expect(scopedStyles).not.toMatch(/--ta-blue:\s*var\(--blue/)
        expect(scopedStyles).not.toMatch(/--ta-ink:\s*var\(--ink/)
        expect(scopedStyles).toMatch(/\.test-atlas \.button\.primary\s*{[^}]*background:\s*var\(--ta-blue\)[^}]*color:\s*#fff/s)
    })
})

describe('Test Atlas original interface', () => {
    const emptyState = { workbooks: [], metadataExists: false, evidence: [] }
    const noSuggestions = { programs: [], phases: [], tests: [], batches: [] }

    /** Toolbox stand-in: the tool form, the validation list and the Run button outside the tool. */
    function Toolbox({ onRun }: { onRun: (config: TestAtlasConfig) => void }) {
        const [config, setConfig] = useState<TestAtlasConfig>(testAtlas.emptyConfig)
        const errors = testAtlas.validate?.(config) ?? []
        const { InputForm } = testAtlas
        return (
            <main>
                <InputForm value={config} onChange={setConfig} />
                <ul aria-label="Check the input">{errors.map((message) => <li key={message}>{message}</li>)}</ul>
                <button type="button" disabled={errors.length > 0} onClick={() => onRun(config)}>Run</button>
            </main>
        )
    }

    const byId = (id: string) => {
        const element = document.getElementById(id)
        if (!element) throw new Error(`#${id} is not rendered`)
        return element
    }
    const textOf = (id: string) => (byId(id).textContent ?? '').trim()
    const runButton = () => screen.getByText('Run') as HTMLButtonElement
    const choose = (input: HTMLElement, files: File[]) => fireEvent.change(input, { target: { files } })
    const type = (id: string, value: string) => fireEvent.change(byId(id), { target: { value } })
    const fillDetails = () => {
        type('ta-programNumber', '80025')
        type('ta-programName', 'BMW')
        type('ta-phase', 'DV')
        type('ta-testNumber', '486')
        type('ta-testDate', '260930')
    }

    const server = (state: unknown = emptyState, conflict = true) => vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input)
        if (url.startsWith('/api/test-atlas/suggestions')) return json(noSuggestions)
        if (url.startsWith('/api/test-atlas/climatic/test-state')) return json(state)
        if (url === '/api/test-atlas/plan') {
            const manifest = JSON.parse(String(init?.body))
            const folder = '80025 - BMW\\DV\\TEST - 486'
            return json({
                root: 'C:\\Proyectos',
                folder,
                directories: [folder, `${folder}\\01_Inputs`, `${folder}\\02_Evidences`, `${folder}\\02_Evidences\\00_Initial`, `${folder}\\02_Evidences\\01_Inspection_250Cycles`, `${folder}\\02_Evidences\\99_Final`],
                existingWorkbooks: [],
                generatedFiles: [],
                renamedFolders: [],
                files: manifest.files.map((file: { id: string; name: string; category: string; size: number }) => ({
                    ...file,
                    relative: `${folder}\\01_Inputs\\260930_CL_Inputs_BMW_DV_486.xlsm`,
                    conflict,
                })),
            })
        }
        if (url === '/api/test-atlas/uploads') return json({ id: UPLOAD_ID })
        if (url === '/api/scripts/TEST_ATLAS') return new Response(`{"type":"result","data":${JSON.stringify(runResult)}}\n`, { status: 200 })
        throw new Error(`Unexpected request ${url}`)
    })

    beforeEach(() => {
        FakeXhr.requests = []
        FakeXhr.reply = { status: 200, body: '{"ok":true}' }
        resetRunState()
        vi.stubGlobal('XMLHttpRequest', FakeXhr)
    })
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('renders the original layout inside the tool scope and offers only the climatic workflow', () => {
        vi.stubGlobal('fetch', server())
        const { container } = render(<Toolbox onRun={vi.fn()} />)

        expect(container.querySelector('.test-atlas-host > .test-atlas .app-shell .sidebar')).not.toBeNull()
        expect(screen.getByText('What kind of test are you organizing?')).toBeTruthy()
        expect(Array.from(byId('ta-stepNav').querySelectorAll('button')).map((button) => button.textContent)).toEqual([
            '01 Test type', '02 Test details', '03 Inputs Excel', '04 Test evidence', '05 Data files', '06 Review & save',
        ])
        const types = Array.from(container.querySelectorAll<HTMLButtonElement>('.type-choice'))
        expect(types.map((button) => [button.querySelector('strong')?.textContent, button.disabled])).toEqual([
            ['Climatic', false], ['Vibration', true], ['EGR valves', true], ['Wind tunnel', true],
        ])
        expect(screen.getAllByText('Coming soon')).toHaveLength(3)
        expect(runButton().disabled).toBe(true)
    })

    it('walks the six original steps and hands the confirmed review to the Toolbox Run', async () => {
        const fetchMock = server()
        vi.stubGlobal('fetch', fetchMock)
        const onRun = vi.fn()
        const { container } = render(<Toolbox onRun={onRun} />)

        fireEvent.click(container.querySelector('[data-type="climatic"]') as HTMLElement)
        expect(screen.getByText('Identify the test')).toBeTruthy()
        fireEvent.click(byId('ta-detailsNext'))
        expect(textOf('ta-message')).toBe('Enter a valid program number. Avoid /, \\, and other path characters.')

        fillDetails()
        expect(textOf('ta-folderPreview')).toBe('80025 - BMW / DV / TEST - 486')
        fireEvent.click(byId('ta-detailsNext'))
        expect(screen.getByText('Add the inputs workbook')).toBeTruthy()
        await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith('/api/test-atlas/climatic/test-state?'))).toBe(true))

        choose(byId('ta-pick-inputs'), [new File(['x'], 'notes.txt')])
        await waitFor(() => expect(textOf('ta-message')).toBe('notes.txt: unsupported format'))
        choose(byId('ta-pick-inputs'), [new File(['xlsx'], 'inputs.xlsm')])
        await waitFor(() => expect(textOf('ta-inputsList')).toContain('inputs.xlsm'))
        fireEvent.click(byId('ta-inputsNext'))
        await waitFor(() => expect(screen.getByText('Add photographic evidence')).toBeTruthy())

        fireEvent.click(byId('ta-addEvidenceSet'))
        type('ta-referenceValue', '250')
        fireEvent.click(byId('ta-confirmEvidence'))
        expect(Array.from(container.querySelectorAll('.evidence-card h3')).map((title) => title.textContent)).toEqual([
            'Initial condition', 'Inspection after cycle 250', 'Final condition',
        ])
        fireEvent.click(container.querySelector('[data-card="3"] [data-next]') as HTMLElement)
        expect(screen.getByText('Add test data')).toBeTruthy()

        fireEvent.click(byId('ta-reviewNext'))
        await waitFor(() => expect(screen.getByText('Review before saving')).toBeTruthy())
        expect(textOf('ta-reviewFolder')).toBe('80025 - BMW\\DV\\TEST - 486')
        expect(textOf('ta-reviewTreeText')).toContain('260930_CL_Inputs_BMW_DV_486.xlsm  ← inputs.xlsm')
        expect(textOf('ta-reviewFiles')).toContain('EXISTS')
        const save = byId('ta-saveButton') as HTMLButtonElement
        expect(save.disabled).toBe(true)
        expect(runButton().disabled).toBe(true)

        fireEvent.click(container.querySelector('[data-overwrite]') as HTMLElement)
        fireEvent.click(byId('ta-confirmCheck'))
        expect(save.disabled).toBe(false)
        expect(runButton().disabled).toBe(false)

        fireEvent.click(save)
        expect(onRun).toHaveBeenCalledTimes(1)
        const submitted = onRun.mock.calls[0][0] as TestAtlasConfig
        expect([submitted.programNumber, submitted.programName, submitted.phase, submitted.testNumber, submitted.date]).toEqual(['80025', 'BMW', 'DV', '486', '260930'])
        expect(submitted.evidenceSets.map((set) => set.title)).toEqual(['Initial condition', 'Inspection after cycle 250', 'Final condition'])
    })

    it('shows the original success card after the Toolbox run and starts a new test from it', async () => {
        vi.stubGlobal('fetch', server(emptyState, false))
        const { container } = render(<Toolbox onRun={(config) => { void testAtlas.execute(config).catch(() => undefined) }} />)

        fireEvent.click(container.querySelector('[data-type="climatic"]') as HTMLElement)
        fillDetails()
        fireEvent.click(byId('ta-detailsNext'))
        choose(byId('ta-pick-inputs'), [new File(['xlsx'], 'inputs.xlsx')])
        await waitFor(() => expect(textOf('ta-inputsList')).toContain('inputs.xlsx'))
        fireEvent.click(byId('ta-inputsNext'))
        await waitFor(() => expect(screen.getByText('Add photographic evidence')).toBeTruthy())
        fireEvent.click(container.querySelector('[data-card="3"] [data-next]') as HTMLElement)
        fireEvent.click(byId('ta-reviewNext'))
        await waitFor(() => expect(screen.getByText('Review before saving')).toBeTruthy())
        fireEvent.click(byId('ta-confirmCheck'))
        fireEvent.click(byId('ta-saveButton'))

        await waitFor(() => expect(textOf('ta-successText')).toBe('1 file saved in C:\\Proyectos\\80025 - BMW\\DV\\TEST - 486.'))
        expect(FakeXhr.requests).toHaveLength(1)
        await waitFor(() => expect(runButton().disabled).toBe(true))

        fireEvent.click(byId('ta-newTest'))
        expect(screen.getByText('What kind of test are you organizing?')).toBeTruthy()
        expect(getRunState()).toEqual({ status: 'idle' })
    })

    it('reuses the inputs workbook and the evidence already saved for the test', async () => {
        vi.stubGlobal('fetch', server({
            workbooks: ['260930_CL_Inputs_BMW_DV_486.xlsm'],
            metadataExists: true,
            evidence: [{
                folder: '00_Initial', type: 'initial', title: 'Initial condition', referenceType: 'none', referenceValue: '', notes: '',
                photos: [{ name: '260930_Evidence_01.jpg', originalName: 'before.jpg', size: 15, captureDate: '2026-09-30T10:00:00', dateSource: 'metadata', preview: true }],
            }, {
                folder: '01_Inspection_250Cycles', type: 'planned_inspection', title: 'Inspection after cycle 250', referenceType: 'cycles', referenceValue: '250', notes: 'Preserve this note',
                photos: [],
            }],
        }))
        const { container } = render(<Toolbox onRun={vi.fn()} />)

        fireEvent.click(container.querySelector('[data-type="climatic"]') as HTMLElement)
        fillDetails()
        fireEvent.click(byId('ta-detailsNext'))
        await waitFor(() => expect(textOf('ta-inputsExistingNames')).toBe('260930_CL_Inputs_BMW_DV_486.xlsm'))
        expect(textOf('ta-inputsRequirement')).toBe('Optional · .xlsx or .xlsm · a workbook is already saved')

        fireEvent.click(byId('ta-inputsNext'))
        await waitFor(() => expect(screen.getByText('Add photographic evidence')).toBeTruthy())
        await waitFor(() => expect(screen.getAllByText('Saved folder')).toHaveLength(2))
        expect(Array.from(container.querySelectorAll('.evidence-card h3')).map((title) => title.textContent)).toEqual([
            'Initial condition', 'Inspection after cycle 250', 'Final condition',
        ])
        expect(screen.getByText('Preserve this note')).toBeTruthy()
        const thumbnail = container.querySelector('.evidence-card-initial img') as HTMLImageElement
        expect(thumbnail.getAttribute('src')).toContain('/api/test-atlas/climatic/evidence-photo?')
        expect(thumbnail.getAttribute('src')).toContain('name=260930_Evidence_01.jpg')
    })
})
