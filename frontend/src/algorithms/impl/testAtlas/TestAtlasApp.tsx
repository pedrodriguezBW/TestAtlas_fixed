import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AlgorithmInputProps } from '../../types'
import { evidencePhotoUrl, fetchTestAtlasTestState, planTestAtlas } from '../../testAtlasApi'
import { resolvePhotoDate } from '../testAtlasCaptureDate'
import {
    CHECKPOINT_TYPES,
    DATE_SOURCE_LABELS,
    EVIDENCE_TYPE_LABELS,
    METADATA_FILE,
    buildManifest,
    canPreview,
    dataFileProblem,
    detailsComplete,
    emptyTestAtlasConfig,
    evidenceFolderName,
    fileExtension,
    formatBytes,
    isImageFile,
    manifestKey,
    mergeSavedEvidence,
    newId,
    photoDate,
    previewUrl,
    registerFile,
    releaseFile,
    suggestedEvidenceTitle,
    testKey,
    uploadList,
    validPart,
    vibrationIssue,
    vibrationSampleFolder,
    type DataCategory,
    type DataFile,
    type EvidenceSetConfig,
    type EvidenceType,
    type PhotoFile,
    type ReferenceType,
    type SavedPhoto,
    type TestAtlasConfig,
    type TestAtlasPlan,
} from '../testAtlasModel'
import { resetRunState, useRunState, type LoadingContent } from './runState'
import { useRepositorySuggestions, type SuggestionField } from './RepositorySuggestions'
import { VisualWorkspace } from './VisualWorkspace'
import { VibrationWorkflow, vibrationTestFolder } from './VibrationWorkflow'
import { planTreeText } from './planTree'
import climateChamber from './assets/climate-chamber.png'
import vibrationShaker from './assets/vibration-shaker.png'
import './test-atlas.css'

// Test Atlas wizard with the original climate-file-organizer design (index.html,
// app.js, styles.css, atlas.css): same markup, classes and copy, rendered with
// React inside the Toolbox. Saving uses the Toolbox Run button (TEST_ATLAS).

const CLIMATIC_STEP_LABELS = ['Test type', 'Test details', 'Inputs Excel', 'Test evidence', 'Data files', 'Review & save']
const VIBRATION_STEP_LABELS = ['Test type', 'Vibration batch', 'Batch inputs', 'Tests & samples', 'Sample files', 'Review & save']
const EVIDENCE_ICONS: Record<EvidenceType, string> = {
    initial: '↗', planned_inspection: '◷', unplanned_stop: 'Ⅱ', incident: '!', restart: '↻', final: '✓', other: '◇',
}
const REFERENCE_PLACEHOLDERS: Record<ReferenceType, string> = {
    cycles: 'e.g. 250', hours: 'e.g. 72', stage: 'e.g. Cold phase', date_time: 'e.g. 2026-10-01 14:30', none: '',
}
const REFERENCE_OPTIONS: Array<[ReferenceType, string]> = [
    ['cycles', 'Cycles'], ['hours', 'Hours'], ['stage', 'Test stage'], ['date_time', 'Date and time'], ['none', 'No reference'],
]
const DATA_ROWS: Array<{ category: Exclude<DataCategory, 'inputs'>; title: string; hint: string; accept?: string; folder: boolean }> = [
    { category: 'simpati', title: 'SIMPATI', hint: 'Archives .x01–.x99 · programs .p01–.p99 / .b01–.b99', folder: true },
    { category: 'graphtec', title: 'Graphtec', hint: 'Graphtec recordings, datalogger exports and CSV / Excel tables · any file format', folder: true },
    { category: 'canoe', title: 'CANoe', hint: 'Vector CANoe logging files · .blf .asc .mf4 .mdf .pcap .pcapng', accept: '.blf,.asc,.mf4,.mdf,.pcap,.pcapng', folder: true },
    { category: 'metadata', title: 'Test metadata', hint: `One file named ${METADATA_FILE} · saved in 04_Report`, accept: '.json,application/json', folder: false },
]
const SIMPATI_ACCEPT = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0'))
    .flatMap((n) => [`.x${n}`, `.p${n}`, `.b${n}`]).join(',')
const PHOTO_ACCEPT = 'image/*,.tif,.tiff,.heic,.heif,.dng'
const pad2 = (value: number) => String(value).padStart(2, '0')
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Message { text: string; info: boolean }
interface CheckpointDraft { type: EvidenceType; referenceType: ReferenceType; referenceValue: string; title: string; notes: string }
const emptyDraft = (): CheckpointDraft => ({ type: 'planned_inspection', referenceType: 'cycles', referenceValue: '', title: '', notes: '' })

/** Full-screen loading screen: delayed opening, one handle per action (app.js `loading`). */
function useLoading() {
    const [content, setContent] = useState<LoadingContent & { open: boolean }>({ open: false, title: 'Loading files', detail: '', progress: null, count: '' })
    const current = useRef(0)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const show = useCallback((options: Partial<LoadingContent>, delay = 0) => {
        const handle = ++current.current
        clearTimeout(timer.current)
        setContent((previous) => ({ ...previous, detail: '', count: '', progress: null, ...options }))
        const open = () => { if (handle === current.current) setContent((previous) => ({ ...previous, open: true })) }
        if (delay > 0) timer.current = setTimeout(open, delay)
        else open()
        return handle
    }, [])
    const update = useCallback((handle: number, options: Partial<LoadingContent>) => {
        if (handle === current.current) setContent((previous) => ({ ...previous, ...options }))
    }, [])
    const hide = useCallback((handle: number) => {
        if (handle !== current.current) return
        clearTimeout(timer.current)
        setContent((previous) => ({ ...previous, open: false }))
    }, [])
    useEffect(() => () => clearTimeout(timer.current), [])
    return { content, show, update, hide }
}

function FileList({ id, files, disabled, onRemove }: { id: string; files: DataFile[]; disabled?: boolean; onRemove: (id: string) => void }) {
    return (
        <div id={id} className="file-list">
            {files.map((file) => (
                <div key={file.id} className="file-item">
                    <span className="file-icon">▤</span>
                    <span className="file-main">{file.name}</span>
                    <small>{formatBytes(file.size)}</small>
                    <button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onRemove(file.id)}>×</button>
                </div>
            ))}
        </div>
    )
}

function PhotoTile({ name, url, saved, date, source, size, title, onRemove, disabled }: {
    name: string; url: string; saved: boolean; date: string | null; source: string; size: number; title: string
    onRemove?: () => void; disabled?: boolean
}) {
    return (
        <figure className={`evidence-photo ${saved ? 'is-saved' : 'is-new'}`}>
            <div className="evidence-thumb">
                {url ? (
                    <img src={url} alt={name} loading="lazy" decoding="async" />
                ) : (
                    <span className="evidence-thumb-icon">▧<small>{fileExtension(name).toUpperCase() || 'IMAGE'}</small></span>
                )}
            </div>
            <span className="evidence-photo-badge">{saved ? 'Saved' : 'New'}</span>
            <figcaption>
                <strong title={title}>{name}</strong>
                <small>{date ? `${date.slice(0, 10)}${source ? ` · ${source}` : ''}` : saved ? 'Saved photo' : `Date: ${source || 'pending'}`}</small>
                <small>{formatBytes(size)}</small>
            </figcaption>
            {onRemove && (
                <button type="button" className="evidence-photo-remove" aria-label={`Remove ${name}`} disabled={disabled} onClick={onRemove}>×</button>
            )}
        </figure>
    )
}

const referenceText = (set: EvidenceSetConfig) => {
    if (set.referenceType === 'none' || !set.referenceValue) return ''
    const units: Record<ReferenceType, string> = { cycles: 'cycles', hours: 'hours', stage: 'stage', date_time: '', none: '' }
    return [set.referenceValue, units[set.referenceType]].filter(Boolean).join(' ')
}

const defaultSubtitle = (type: EvidenceType) => type === 'initial'
    ? 'Photographs showing the setup and samples before starting the test.'
    : type === 'final'
        ? 'Photographs showing the samples and setup after completing the test.'
        : 'Photographic evidence captured during this test event.'

/** Pick files through a hidden input, like the original "Choose file" / "Add folder" buttons. */
function useFilePicker() {
    const refs = useRef(new Map<string, HTMLInputElement | null>())
    const pick = (name: string) => refs.current.get(name)?.click()
    const input = (name: string, options: { accept?: string; multiple?: boolean; folder?: boolean; onFiles: (files: File[]) => void }) => (
        <input
            type="file"
            id={`ta-${name}`}
            hidden
            accept={options.accept}
            multiple={options.multiple}
            ref={(element) => {
                refs.current.set(name, element)
                if (element && options.folder) element.setAttribute('webkitdirectory', '')
            }}
            onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                if (files.length) options.onFiles(files)
            }}
        />
    )
    return { pick, input }
}

/** Find the Toolbox Run button of this execution view (outside the tool) and press it. */
const pressToolboxRun = (from: HTMLElement | null) => {
    let node = from?.parentElement ?? null
    while (node) {
        const run = Array.from(node.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Run' && !from?.contains(button))
        if (run) {
            if (!run.disabled) run.click()
            else run.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
            return
        }
        node = node.parentElement
    }
}

export function TestAtlasApp({ value, onChange, disabled }: AlgorithmInputProps<TestAtlasConfig>) {
    const run = useRunState()
    const loading = useLoading()
    const pickers = useFilePicker()
    const [message, setMessage] = useState<Message | null>(null)
    const [draft, setDraft] = useState<CheckpointDraft | null>(null)
    const [enterKey, setEnterKey] = useState(0)
    const [paused, setPaused] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const [knownRoot, setKnownRoot] = useState('')
    const hostRef = useRef<HTMLDivElement | null>(null)
    const messageRef = useRef<HTMLDivElement | null>(null)
    const dateRef = useRef<HTMLInputElement | null>(null)
    const draftRefs = useRef<{ type: HTMLSelectElement | null; value: HTMLInputElement | null; title: HTMLInputElement | null; form: HTMLDivElement | null }>({ type: null, value: null, title: null, form: null })
    const latest = useRef(value)
    latest.current = value
    const existingInputsKey = useRef('')
    const savedEvidenceKey = useRef('')
    const saving = Boolean(disabled) || run.status === 'running'
    const step = value.step
    const success = run.status === 'done'

    /** Apply a change on top of the latest configuration (async handlers included). */
    const update = useCallback((patch: Partial<TestAtlasConfig>) => {
        const next = { ...latest.current, ...patch }
        latest.current = next
        onChange(next)
    }, [onChange])

    // Any edit invalidates the review, exactly like `plan = null` in the original.
    const edit = useCallback((patch: Partial<TestAtlasConfig>) => update({ ...patch, review: null, confirmed: false }), [update])

    const error = useCallback((text: string) => setMessage({ text, info: false }), [])
    const notice = useCallback((text: string) => setMessage({ text, info: true }), [])
    const clearError = useCallback(() => setMessage(null), [])
    useEffect(() => {
        if (message) messageRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }, [message])

    useEffect(() => { resetRunState() }, [])
    useEffect(() => {
        if (run.status === 'failed') setMessage({ text: run.error, info: false })
        // A saved review cannot be saved twice: the Toolbox Run stays disabled until a new test.
        if (run.status === 'done' && latest.current.review) update({ review: null, confirmed: false })
    }, [run, update])
    useEffect(() => {
        const root = value.review?.plan.root
        if (root) setKnownRoot(root)
    }, [value.review])

    // The loading screen blocks scrolling of the page, as in the original.
    const overlay: LoadingContent | null = run.status === 'running' ? run.loading : loading.content.open ? loading.content : null
    const overlayOpen = overlay !== null
    useEffect(() => {
        if (!overlayOpen) return undefined
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = previous }
    }, [overlayOpen])

    const suggestions = useRepositorySuggestions({
        values: value,
        onChoose: (patch) => detailsChanged(patch),
    })

    /** Details edited: refresh the preview and forget what was found for another test. */
    const detailsChanged = (patch: Partial<Pick<TestAtlasConfig, SuggestionField | 'date'>>) => {
        const next = { ...latest.current, ...patch }
        const extra: Partial<TestAtlasConfig> = {}
        if (existingInputsKey.current !== testKey(next)) {
            existingInputsKey.current = ''
            extra.existingInputs = []
            extra.metadataExists = false
        }
        edit({ ...patch, ...extra })
    }

    /**
     * Ask the server what is already saved for this test: inputs workbooks,
     * test_metadata.json and the evidence folders with their photos.
     */
    const refreshTestState = useCallback(async ({ showLoading = false } = {}) => {
        const current = latest.current
        if (!detailsComplete(current)) {
            existingInputsKey.current = ''
            const keyChanged = savedEvidenceKey.current !== ''
            savedEvidenceKey.current = ''
            update({ existingInputs: [], metadataExists: false, evidenceSets: mergeSavedEvidence(current.evidenceSets, [], keyChanged), ...(keyChanged ? { review: null, confirmed: false } : {}) })
            return []
        }
        const key = testKey(current)
        const loader = showLoading
            ? loading.show({ title: 'Loading saved evidence', detail: 'Reading the evidence folders of this test…', progress: null }, 200)
            : null
        try {
            const result = await fetchTestAtlasTestState(current)
            if (key !== testKey(latest.current)) return latest.current.existingInputs
            const keyChanged = key !== savedEvidenceKey.current
            const before = latest.current.evidenceSets
            const merged = mergeSavedEvidence(before, result.evidence || [], keyChanged)
            const found = merged.some((set) => set.existingFolder && !before.some((old) => old.existingFolder === set.existingFolder))
            existingInputsKey.current = key
            savedEvidenceKey.current = key
            update({
                existingInputs: result.workbooks || [],
                metadataExists: Boolean(result.metadataExists),
                evidenceSets: merged,
                ...(keyChanged || found ? { review: null, confirmed: false } : {}),
            })
            return result.workbooks || []
        } catch {
            existingInputsKey.current = ''
            update({ existingInputs: [], metadataExists: false })
            return []
        } finally {
            if (loader !== null) loading.hide(loader)
        }
    }, [loading, update])

    // The original scrolls the page to the top of the wizard on every step.
    const scrollToTop = () => {
        const top = hostRef.current?.getBoundingClientRect().top ?? 0
        if (top < 0) window.scrollTo({ top: top + window.scrollY, behavior: 'smooth' })
    }

    /** Move between wizard cards (app.js showStep). */
    const showStep = (number: number, patch: Partial<TestAtlasConfig> = {}) => {
        const maxStep = Math.max(latest.current.maxStep, number)
        clearError()
        if (latest.current.step === 5 && number !== 5) resetRunState()
        update({ ...patch, step: number, maxStep })
        setEnterKey((key) => key + 1)
        if (latest.current.testType === 'climatic' && [2, 3, 4].includes(number)) void refreshTestState({ showLoading: number === 3 })
        scrollToTop()
    }

    const inputsReady = (config = latest.current) =>
        config.files.filter((file) => file.category === 'inputs').length === 1 || config.existingInputs.length > 0

    /** Validate the test details (app.js checkDetails). */
    const checkDetails = () => {
        const values = latest.current
        for (const [key, label] of [['programNumber', 'Program number'], ['programName', 'Program name'], ['phase', 'Phase'], ['testNumber', 'Test number']] as const) {
            if (!validPart(values[key].trim())) {
                error(`Enter a valid ${label.toLowerCase()}. Avoid /, \\, and other path characters.`)
                suggestions.input(key)?.focus()
                return false
            }
        }
        const date = values.date.trim()
        if (!/^\d{6}$/.test(date)) {
            error('Date must have exactly six digits in YYMMDD format.')
            dateRef.current?.focus()
            return false
        }
        const year = 2000 + Number(date.slice(0, 2))
        const month = Number(date.slice(2, 4))
        const day = Number(date.slice(4))
        const parsed = new Date(Date.UTC(year, month - 1, day))
        if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
            error('Enter a real calendar date in YYMMDD format.')
            dateRef.current?.focus()
            return false
        }
        return true
    }

    /** Ask the server to calculate the destination plan (app.js review). */
    const startReview = async () => {
        if (latest.current.testType === 'vibration') {
            const issue = vibrationIssue(latest.current)
            if (issue) {
                if (latest.current.step !== issue.step) showStep(issue.step)
                error(issue.message)
                return
            }
        } else {
            if (!checkDetails()) return
            await refreshTestState()
            if (!inputsReady()) {
                error('Add one inputs .xlsx or .xlsm workbook before reviewing. No inputs workbook was found for this test yet.')
                return
            }
        }
        const loader = loading.show({ title: 'Preparing the review', detail: 'Checking destinations and existing files…', progress: null }, 200)
        try {
            const requested = manifestKey(latest.current)
            const plan: TestAtlasPlan = await planTestAtlas(buildManifest(latest.current))
            if (requested !== manifestKey(latest.current)) return
            // Climatic test_metadata.json is expected to be replaced: approved by default, with a warning.
            const approved = latest.current.testType === 'climatic'
                ? plan.files.filter((file) => file.conflict && file.category === 'metadata').map((file) => file.id)
                : []
            showStep(5, { review: { key: requested, plan, approved }, confirmed: false })
        } catch (caught) {
            error(caught instanceof Error ? caught.message : String(caught))
        } finally {
            loading.hide(loader)
        }
    }

    /** Validate and add standard files (app.js addFiles). */
    const addFiles = async (category: DataCategory, selected: File[]) => {
        clearError()
        const additions: DataFile[] = []
        const problems: string[] = []
        const loader = loading.show({ title: 'Loading files', detail: 'Checking the selected files…', progress: 0, count: `0 of ${selected.length}` }, 150)
        for (const [index, file] of selected.entries()) {
            if (index % 25 === 0) {
                loading.update(loader, { detail: file.name, progress: index / selected.length, count: `${index} of ${selected.length}` })
                await nextFrame()
            }
            const problem = dataFileProblem(file, category)
            if (problem) {
                problems.push(problem)
                continue
            }
            if (category === 'metadata') {
                try {
                    JSON.parse(await file.text())
                } catch {
                    problems.push(`${file.name}: the file does not contain valid JSON`)
                    continue
                }
            }
            additions.push({ ...registerFile(file), category })
        }
        const files = latest.current.files
        if (category === 'inputs' || category === 'metadata') {
            // Single-file categories: a new selection replaces the previous one.
            if (additions.length) {
                files.filter((file) => file.category === category).forEach((file) => releaseFile(file.id))
                additions.slice(1).forEach((file) => releaseFile(file.id))
                edit({ files: [...files.filter((file) => file.category !== category), additions[0]] })
            }
            if (additions.length > 1) {
                problems.push(category === 'inputs' ? 'Only one inputs workbook can be selected.' : `Only one ${METADATA_FILE} can be selected.`)
            }
        } else if (additions.length) {
            edit({ files: [...files, ...additions] })
        }
        loading.hide(loader)
        if (problems.length) error(problems.join(' · '))
    }

    const removeFile = (id: string) => {
        releaseFile(id)
        edit({ files: latest.current.files.filter((file) => file.id !== id) })
    }

    /** Validate and add photos to one evidence set (app.js addEvidencePhotos). */
    const addEvidencePhotos = async (evidenceId: string, selected: File[]) => {
        clearError()
        if (!latest.current.evidenceSets.some((set) => set.id === evidenceId)) {
            error('The selected evidence set no longer exists.')
            return
        }
        const additions: PhotoFile[] = []
        const problems: string[] = []
        const fallbacks = { modified: 0, test: 0 }
        const loader = loading.show({ title: 'Loading photos', detail: 'Reading capture dates…', progress: 0, count: `0 of ${selected.length}` }, 150)
        for (const [index, file] of selected.entries()) {
            loading.update(loader, { detail: file.name, progress: index / selected.length, count: `${index} of ${selected.length}` })
            if (!isImageFile(file.name, file.type)) {
                problems.push(`${file.name}: unsupported image format`)
                continue
            }
            if (file.size > 2 * 1024 * 1024 * 1024) {
                problems.push(`${file.name}: larger than 2 GB`)
                continue
            }
            const resolved = await resolvePhotoDate(file)
            if (resolved.dateSource !== 'metadata') fallbacks[resolved.dateSource]++
            additions.push({ ...registerFile(file), ...resolved })
        }
        const date = latest.current.date
        edit({
            evidenceSets: latest.current.evidenceSets.map((set) => set.id !== evidenceId ? set : {
                ...set,
                photos: [...set.photos, ...additions].sort((first, second) =>
                    String(photoDate(first, date) || '').localeCompare(String(photoDate(second, date) || ''))
                    || first.name.localeCompare(second.name)),
            }),
        })
        loading.hide(loader)
        if (problems.length) {
            error(problems.join(' · '))
        } else if (fallbacks.modified || fallbacks.test) {
            notice([
                fallbacks.modified ? `${fallbacks.modified} photo(s) have no capture date in their metadata; the file's modified date is used.` : '',
                fallbacks.test ? `${fallbacks.test} photo(s) have no usable date; the test date from Test details is used.` : '',
            ].filter(Boolean).join(' '))
        }
    }

    const removePhoto = (evidenceId: string, photoId: string) => {
        releaseFile(photoId)
        edit({ evidenceSets: latest.current.evidenceSets.map((set) => set.id !== evidenceId ? set : { ...set, photos: set.photos.filter((photo) => photo.id !== photoId) }) })
    }

    /** Move an intermediate checkpoint up (-1) or down (+1); Initial and Final stay first and last. */
    const moveEvidenceSet = (evidenceId: string, direction: number) => {
        const sets = [...latest.current.evidenceSets]
        const index = sets.findIndex((set) => set.id === evidenceId)
        const target = index + direction
        if (index < 1 || target < 1 || target > sets.length - 2) return
        ;[sets[index], sets[target]] = [sets[target], sets[index]]
        edit({ evidenceSets: sets })
    }

    const removeEvidenceSet = (evidenceId: string) => {
        const set = latest.current.evidenceSets.find((item) => item.id === evidenceId)
        set?.photos.forEach((photo) => releaseFile(photo.id))
        edit({ evidenceSets: latest.current.evidenceSets.filter((item) => item.id !== evidenceId) })
    }

    /** Read and validate the checkpoint form (app.js addEvidenceSet). */
    const addEvidenceSet = () => {
        if (!draft) return
        clearError()
        const referenceValue = draft.referenceValue.trim()
        if (draft.referenceType !== 'none' && !referenceValue) {
            error('Enter a reference value or select “No reference”.')
            draftRefs.current.value?.focus()
            return
        }
        if (referenceValue && !validPart(referenceValue)) {
            error('Enter a valid reference value. Avoid /, \\, and other path characters.')
            draftRefs.current.value?.focus()
            return
        }
        const title = draft.title.trim() || suggestedEvidenceTitle(draft.type, draft.referenceType, referenceValue)
        if (!validPart(title)) {
            error('Enter a valid checkpoint title. Avoid /, \\, and other path characters.')
            draftRefs.current.title?.focus()
            return
        }
        const sets = [...latest.current.evidenceSets]
        const finalIndex = sets.findIndex((set) => set.type === 'final')
        const checkpoint: EvidenceSetConfig = {
            id: newId(), type: draft.type, title, referenceType: draft.referenceType, referenceValue,
            notes: draft.notes.trim(), existingFolder: '', savedPhotos: [], photos: [],
        }
        if (finalIndex >= 0) sets.splice(finalIndex, 0, checkpoint)
        else sets.push(checkpoint)
        edit({ evidenceSets: sets })
        setDraft(null)
    }

    const draftOpen = draft !== null
    useEffect(() => {
        if (draftOpen) draftRefs.current.form?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }, [draftOpen])

    /** Start again with an empty test (the original reloads the page). */
    const newTest = () => {
        for (const id of uploadList(latest.current).map((file) => file.id)) releaseFile(id)
        existingInputsKey.current = ''
        savedEvidenceKey.current = ''
        resetRunState()
        setDraft(null)
        clearError()
        update(emptyTestAtlasConfig())
        setEnterKey((key) => key + 1)
        scrollToTop()
    }

    const selectClimatic = () => {
        showStep(1, { testType: 'climatic', review: null, confirmed: false })
    }

    const selectVibration = () => {
        showStep(1, { testType: 'vibration', review: null, confirmed: false })
    }

    // ------------------------------------------------------------------ view

    const files = (category: DataCategory) => value.files.filter((file) => file.category === category)
    const inputsFile = files('inputs')
    const reviewed = value.review && value.review.key === manifestKey(value) ? value.review : null
    const conflicts = reviewed?.plan.files.filter((file) => file.conflict) ?? []
    const unresolved = conflicts.some((file) => !reviewed?.approved.includes(file.id))
    const canSave = !saving && Boolean(reviewed) && value.confirmed && !unresolved
    const details = { programNumber: value.programNumber, programName: value.programName, phase: value.phase, testNumber: value.testNumber }
    const vibrationSamples = value.vibrationTests.flatMap((test) => test.materialMasters)
    const activeVibrationTest = value.vibrationTests[0]
    const activeVibrationSample = activeVibrationTest?.materialMasters[0]
    const visualState = {
        testType: value.testType ?? 'climatic',
        step: success ? 6 : step,
        details: { ...details, date: value.date, batchName: value.batchName },
        workbook: value.testType === 'vibration' ? value.inputsWorkbook?.name || '' : inputsFile[0]?.name || '',
        existingWorkbook: value.existingInputs[0] || '',
        evidence: value.evidenceSets.map((set) => ({ title: set.title, count: set.photos.length + set.savedPhotos.length })),
        data: value.testType === 'vibration' && activeVibrationSample
            ? [activeVibrationSample.evidenceSets.reduce((total, set) => total + set.photos.length, 0), activeVibrationSample.results.length, activeVibrationSample.characterization.length]
            : (['simpati', 'graphtec', 'canoe'] as const).map((category) => files(category).length),
        total: uploadList(value).length,
        conflicts: conflicts.length,
        testCount: value.vibrationTests.length,
        sampleCount: vibrationSamples.length,
        canoe: activeVibrationSample?.canoe.length ?? 0,
        currentTest: activeVibrationTest ? vibrationTestFolder(activeVibrationTest) : '',
        currentSample: activeVibrationSample ? vibrationSampleFolder(activeVibrationSample.materialMasterCode) : '',
        sampleWorkbook: activeVibrationSample?.inputsWorkbook?.name || activeVibrationSample?.existingWorkbook || '',
    }
    const backButton = <button className="button ghost" data-back type="button" disabled={saving} onClick={() => showStep(step - 1)}>Back</button>
    const card = (number: number, children: ReactNode) => (
        <section key={`card-${number}-${enterKey}`} className="card card-enter" data-card={number} aria-labelledby={`ta-heading${number}`}>
            {children}
        </section>
    )

    const typeChoice = (
        <section key={`card-0-${enterKey}`} className={`card${enterKey ? ' card-enter' : ' current'}`} data-card="0" aria-labelledby="ta-heading0">
            <div className="card-top"><span className="card-kicker">STEP 01 · TEST CATEGORY</span><h2 id="ta-heading0">What kind of test are you organizing?</h2><p>Select a category to continue.</p></div>
            <div className="category-stage">
                <div className="type-grid" role="group" aria-label="Test type">
                    <button className={`type-choice${value.testType === 'climatic' ? ' selected' : ''}`} data-type="climatic" type="button" disabled={saving} onClick={selectClimatic}>
                        <span className="type-icon climate-icon" aria-hidden="true"><img src={climateChamber} alt="" /></span>
                        <span><strong>Climatic</strong><small>Temperature & humidity</small></span>
                        <span className="select-indicator" />
                    </button>
                    <button className={`type-choice${value.testType === 'vibration' ? ' selected' : ''}`} data-type="vibration" type="button" disabled={saving} onClick={selectVibration}>
                        <span className="type-icon equipment-icon" aria-hidden="true"><img src={vibrationShaker} alt="" /></span>
                        <span><strong>Vibration</strong><small>Batches, tests & samples</small></span>
                        <span className="select-indicator" />
                    </button>
                    <button className="type-choice" type="button" disabled>
                        <span className="type-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M7 7V17L24 26L41 17V7M7 41V31L24 22L41 31V41M24 5V43" /><circle cx="24" cy="24" r="9" /></svg></span>
                        <span><strong>EGR valves</strong><small>Coming soon</small></span>
                    </button>
                    <button className="type-choice" type="button" disabled>
                        <span className="type-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M3 13H36L31 8M3 24H45L40 19M3 35H36L31 30" /></svg></span>
                        <span><strong>Wind tunnel</strong><small>Coming soon</small></span>
                    </button>
                </div>
            </div>
        </section>
    )

    const detailsCard = card(1, <>
        <div className="card-top"><span className="card-kicker">STEP 02 · TEST DETAILS</span><h2 id="ta-heading1">Identify the test</h2><p>These details determine the program, phase, and test folders.</p></div>
        <div className="form-grid">
            {([['programNumber', 'Program number', 'e.g. 80834'], ['programName', 'Program name', 'e.g. Stellantis Small'], ['phase', 'Phase', 'e.g. DV'], ['testNumber', 'Test number', 'e.g. 389']] as const).map(([key, label, placeholder]) => (
                <label key={key}>{label} <span className="required">*</span>{suggestions.field(key, {
                    value: value[key],
                    placeholder,
                    disabled: saving,
                    onChange: (next) => detailsChanged({ [key]: next }),
                })}</label>
            ))}
            <label>Date <span className="required">*</span><input id="ta-testDate" ref={dateRef} inputMode="numeric" maxLength={6} placeholder="YYMMDD" aria-describedby="ta-dateHint" value={value.date} disabled={saving} onChange={(event) => detailsChanged({ date: event.currentTarget.value })} /><small id="ta-dateHint">Six digits, for example 260930.</small></label>
        </div>
        <div className="folder-preview"><div className="preview-title">DESTINATION PREVIEW</div><div id="ta-folderPreview">{`${value.programNumber.trim() || 'Program number'} - ${value.programName.trim() || 'Program name'} / ${value.phase.trim() || 'Phase'} / TEST - ${value.testNumber.trim() || 'Test number'}`}</div></div>
        <div className="card-actions">{backButton}<button className="button primary" id="ta-detailsNext" type="button" disabled={saving} onClick={() => { if (checkDetails()) showStep(2) }}>Continue</button></div>
    </>)

    const inputsCard = card(2, <>
        <div className="card-top"><span className="card-kicker">STEP 03 · REQUIRED INPUT</span><h2 id="ta-heading2">Add the inputs workbook</h2><p>Select one .xlsx or .xlsm file. Its saved name will be generated from the test details while keeping its extension.</p></div>
        <div id="ta-inputsExisting" className="inputs-existing" role="status" hidden={value.existingInputs.length === 0}>
            <strong>Inputs workbook already saved for this test</strong>
            <span id="ta-inputsExistingNames">{value.existingInputs.join(' · ')}</span>
            <small>You can continue without adding it again. Choose a file only if you want to save a new version.</small>
        </div>
        <div className="upload-zone">
            <div className="upload-icon">↥</div>
            <strong>Inputs Excel file</strong>
            <span id="ta-inputsRequirement">{value.existingInputs.length > 0 ? 'Optional · .xlsx or .xlsm · a workbook is already saved' : 'Required · .xlsx or .xlsm'}</span>
            <button type="button" className="button secondary" data-pick="inputs" disabled={saving} onClick={() => pickers.pick('pick-inputs')}>Choose file</button>
            {pickers.input('pick-inputs', { accept: '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12', onFiles: (list) => { void addFiles('inputs', list) } })}
        </div>
        <FileList id="ta-inputsList" files={inputsFile} disabled={saving} onRemove={removeFile} />
        <div className="card-actions">{backButton}<button className="button primary" id="ta-inputsNext" type="button" disabled={saving} onClick={async () => {
            if (!inputsReady()) await refreshTestState()
            if (!inputsReady()) error('Add one inputs .xlsx or .xlsm workbook to continue. No inputs workbook was found for this test yet.')
            else showStep(3)
        }}>Continue</button></div>
    </>)

    const evidenceCard = (set: EvidenceSetConfig, index: number) => {
        const locked = set.type === 'initial' || set.type === 'final'
        const folderName = evidenceFolderName(set, index)
        const kind = set.type.replaceAll('_', '-')
        const total = set.photos.length + set.savedPhotos.length
        return (
            <article key={set.id} className={`evidence-card evidence-card-${kind}`}>
                <div className="evidence-card-header">
                    <div className="evidence-identity">
                        <div className="evidence-icon">{EVIDENCE_ICONS[set.type] || '◇'}</div>
                        <div className="evidence-heading">
                            <div className="evidence-heading-top">
                                <span className="evidence-sequence">{set.type === 'initial' ? '00' : set.type === 'final' ? '99' : pad2(index)}</span>
                                <span className={`evidence-badge evidence-badge-${kind}`}>{EVIDENCE_TYPE_LABELS[set.type] || 'Evidence'}</span>
                                {set.existingFolder && <span className="evidence-saved-tag">Saved folder</span>}
                            </div>
                            <h3>{set.title}</h3>
                            <p>{referenceText(set) || defaultSubtitle(set.type)}</p>
                            <p className="evidence-folder">
                                Folder: <code>{`02_Evidences\\${folderName}`}</code>
                                {set.existingFolder && set.existingFolder !== folderName && (
                                    <span className="evidence-renamed">{` · renamed from ${set.existingFolder} when you save`}</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="evidence-actions">
                        {!locked && ([[-1, 'up', '↑'], [1, 'down', '↓']] as const).map(([direction, label, symbol]) => (
                            <button
                                key={label}
                                type="button"
                                className="evidence-move"
                                data-move={label}
                                data-evidence={set.id}
                                title={`Move ${label}`}
                                aria-label={`Move ${set.title} ${label}`}
                                disabled={saving || (direction < 0 ? index <= 1 : index >= value.evidenceSets.length - 2)}
                                onClick={() => moveEvidenceSet(set.id, direction)}
                            >{symbol}</button>
                        ))}
                        {!locked && !set.existingFolder && (
                            <button type="button" className="evidence-remove" title="Remove checkpoint" aria-label={`Remove checkpoint ${set.title}`} disabled={saving} onClick={() => removeEvidenceSet(set.id)}>×</button>
                        )}
                    </div>
                </div>
                <div className="evidence-content">
                    {set.notes && <div className="evidence-notes"><strong>Notes</strong><span>{set.notes}</span></div>}
                    <div className="evidence-photo-list">
                        {total === 0 ? (
                            <div className="evidence-empty">
                                <span className="evidence-empty-icon">▧</span>
                                <div><strong>No photos yet</strong><span>Add individual images or select several at once.</span></div>
                            </div>
                        ) : (
                            <>
                                <div className="evidence-photo-header">
                                    <strong>Photos in this folder</strong>
                                    <span>{[set.savedPhotos.length ? `${set.savedPhotos.length} saved` : '', set.photos.length ? `${set.photos.length} new` : ''].filter(Boolean).join(' · ')}</span>
                                </div>
                                <div className="evidence-gallery">
                                    {set.savedPhotos.map((photo: SavedPhoto) => (
                                        <PhotoTile
                                            key={`saved-${photo.name}`}
                                            name={photo.name}
                                            url={photo.preview && set.existingFolder ? evidencePhotoUrl(details, set.existingFolder, photo.name) : ''}
                                            saved
                                            date={photo.captureDate || null}
                                            source={DATE_SOURCE_LABELS[photo.dateSource as keyof typeof DATE_SOURCE_LABELS] || ''}
                                            size={photo.size}
                                            title={photo.originalName ? `${photo.name} (from ${photo.originalName})` : photo.name}
                                        />
                                    ))}
                                    {set.photos.map((photo) => (
                                        <PhotoTile
                                            key={photo.id}
                                            name={photo.name}
                                            url={canPreview(photo.name) ? previewUrl(photo.id) : ''}
                                            saved={false}
                                            date={photoDate(photo, value.date)}
                                            source={DATE_SOURCE_LABELS[photo.dateSource] || ''}
                                            size={photo.size}
                                            title={photo.name}
                                            disabled={saving}
                                            onRemove={() => removePhoto(set.id, photo.id)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="evidence-upload-area">
                        <button type="button" className="button evidence-add-photos" disabled={saving} onClick={() => pickers.pick(`photos-${set.id}`)}>
                            <span>↑</span><span>{total > 0 ? 'Add more photos' : 'Choose photos'}</span>
                        </button>
                        <small>Date: photo metadata, otherwise the file modified date, otherwise the test date.</small>
                        {pickers.input(`photos-${set.id}`, { accept: PHOTO_ACCEPT, multiple: true, onFiles: (list) => { void addEvidencePhotos(set.id, list) } })}
                    </div>
                </div>
            </article>
        )
    }

    const evidenceStep = card(3, <>
        <div className="card-top">
            <span className="card-kicker">STEP 04 · TEST EVIDENCE</span>
            <h2 id="ta-heading3">Add photographic evidence</h2>
            <p>Organize photos according to the moment or event in which they were captured.</p>
        </div>
        <div id="ta-evidenceSets" className="evidence-sets">{value.evidenceSets.map(evidenceCard)}</div>
        <button type="button" className="button secondary" id="ta-addEvidenceSet" hidden={draft !== null} disabled={saving} onClick={() => {
            clearError()
            setDraft(emptyDraft())
            setTimeout(() => draftRefs.current.type?.focus(), 0)
        }}>+ Add checkpoint</button>
        <div id="ta-evidenceForm" className="evidence-form" hidden={draft === null} ref={(element) => { draftRefs.current.form = element }}>
            <div className="evidence-form-heading">
                <div>
                    <span className="card-kicker">NEW TEST EVENT</span>
                    <h3>Add an intermediate checkpoint</h3>
                    <p>Describe when the photographs were captured during the test.</p>
                </div>
            </div>
            <label>Event type <select id="ta-evidenceType" ref={(element) => { draftRefs.current.type = element }} value={draft?.type ?? 'planned_inspection'} onChange={(event) => draft && setDraft({ ...draft, type: event.currentTarget.value as EvidenceType })}>
                {CHECKPOINT_TYPES.map((type) => <option key={type} value={type}>{EVIDENCE_TYPE_LABELS[type]}</option>)}
            </select></label>
            <label>Reference type <select id="ta-referenceType" value={draft?.referenceType ?? 'cycles'} onChange={(event) => {
                if (!draft) return
                const referenceType = event.currentTarget.value as ReferenceType
                setDraft({ ...draft, referenceType, referenceValue: referenceType === 'none' ? '' : draft.referenceValue })
            }}>
                {REFERENCE_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select></label>
            <label>Reference value <input id="ta-referenceValue" ref={(element) => { draftRefs.current.value = element }} type="text" maxLength={50} placeholder={REFERENCE_PLACEHOLDERS[draft?.referenceType ?? 'cycles']} autoComplete="off" disabled={(draft?.referenceType ?? 'cycles') === 'none'} value={draft?.referenceValue ?? ''} onChange={(event) => draft && setDraft({ ...draft, referenceValue: event.currentTarget.value })} /></label>
            <label>Custom title <input id="ta-evidenceTitle" ref={(element) => { draftRefs.current.title = element }} type="text" maxLength={90} placeholder="Optional, generated automatically if empty" autoComplete="off" value={draft?.title ?? ''} onChange={(event) => draft && setDraft({ ...draft, title: event.currentTarget.value })} /></label>
            <label className="full-width">Notes <textarea id="ta-evidenceNotes" maxLength={500} placeholder="Optional observations about this inspection, stop or incident" value={draft?.notes ?? ''} onChange={(event) => draft && setDraft({ ...draft, notes: event.currentTarget.value })} /></label>
            <div className="evidence-form-actions">
                <button type="button" className="button ghost" id="ta-cancelEvidence" onClick={() => { setDraft(null); clearError() }}>Cancel</button>
                <button type="button" className="button primary" id="ta-confirmEvidence" onClick={addEvidenceSet}>Add checkpoint</button>
            </div>
        </div>
        <div className="note">Initial and final evidence sets are always available. Add checkpoints for inspections, stops, incidents or restarts and use ↑ ↓ to change their order; folder numbers follow that order. Photos already saved for this test are shown in each group.</div>
        <div className="card-actions">{backButton}<button className="button primary" type="button" data-next disabled={saving} onClick={() => showStep(4)}>Continue</button></div>
    </>)

    const dataCard = card(4, <>
        <div className="card-top"><span className="card-kicker">STEP 05 · OPTIONAL DATA</span><h2 id="ta-heading4">Add test data</h2><p>Add as many files as needed. Original file names will be retained.</p></div>
        <div className="data-panels">
            {DATA_ROWS.map((row) => (
                <div key={row.category} className={`data-row${row.category === 'metadata' ? ' data-row-metadata' : ''}`}>
                    <div><strong>{row.title}</strong><small>{row.hint}</small></div>
                    <div className="upload-buttons">
                        <button className="button secondary" data-pick={row.category} type="button" disabled={saving} onClick={() => pickers.pick(`pick-${row.category}`)}>{row.folder ? 'Add files' : 'Choose file'}</button>
                        {row.folder && <button className="button subtle" data-folder={row.category} type="button" disabled={saving} onClick={() => pickers.pick(`folder-${row.category}`)}>Add folder</button>}
                    </div>
                    {pickers.input(`pick-${row.category}`, { accept: row.category === 'simpati' ? SIMPATI_ACCEPT : row.accept, multiple: row.folder, onFiles: (list) => { void addFiles(row.category, list) } })}
                    {row.folder && pickers.input(`folder-${row.category}`, { multiple: true, folder: true, onFiles: (list) => { void addFiles(row.category, list) } })}
                    {row.category === 'metadata' && (
                        <div id="ta-metadataWarning" className="metadata-warning" role="alert" hidden={!(files('metadata').length > 0 && value.metadataExists)}>
                            {files('metadata').length > 0 && value.metadataExists
                                ? `⚠ This test already has a ${METADATA_FILE} in 04_Report. It will be overwritten with the selected file when you save.`
                                : ''}
                        </div>
                    )}
                    <FileList id={`ta-${row.category}List`} files={files(row.category)} disabled={saving} onRemove={removeFile} />
                </div>
            ))}
        </div>
        <div className="card-actions">{backButton}<button className="button primary" id="ta-reviewNext" type="button" disabled={saving} onClick={() => { void startReview() }}>Review files</button></div>
    </>)

    const reviewCard = card(5, <>
        <div className="card-top"><span className="card-kicker">STEP 06 · FINAL REVIEW</span><h2 id="ta-heading5">Review before saving</h2><p>Check the destination and file names. Nothing has been added to the project repository yet.</p></div>
        <div className="review-destination"><small>PROJECT DESTINATION</small><strong id="ta-reviewFolder">{reviewed?.plan.folder}</strong><span id="ta-reviewRoot">{reviewed?.plan.root}</span></div>
        <div id="ta-reviewTree" className="review-tree" hidden={!reviewed}>
            <div className="review-tree-heading"><strong>Folder structure</strong><span id="ta-reviewTreeCount">{reviewed ? `${reviewed.plan.files.length} new file${reviewed.plan.files.length === 1 ? '' : 's'}` : ''}</span></div>
            <p id="ta-reviewTreeHint">Empty folders are included. Renamed files show their original name after “←”. An inputs workbook marked “keep” is already saved and stays unchanged.</p>
            <pre id="ta-reviewTreeText" aria-label="Planned folder structure">{reviewed ? planTreeText(reviewed.plan) : ''}</pre>
        </div>
        <div id="ta-reviewFilesHeading" className="review-heading" hidden={conflicts.length === 0}><strong id="ta-reviewFilesTitle">Existing files to replace</strong><span id="ta-fileCount">{`${conflicts.length} file${conflicts.length === 1 ? '' : 's'} already saved`}</span></div>
        <div id="ta-reviewFiles" className="review-files" hidden={conflicts.length === 0}>
            {conflicts.map((file) => {
                const metadata = value.testType === 'climatic' && file.category === 'metadata'
                return (
                    <div key={file.id} className={`review-file${metadata ? ' review-file-warning' : ''}`}>
                        <div>
                            <strong>{file.relative}<span className="conflict-badge">{metadata ? 'WILL BE OVERWRITTEN' : 'EXISTS'}</span></strong>
                            <small>{`From ${file.name} · ${formatBytes(file.size)}`}</small>
                        </div>
                        <label className="overwrite">
                            <input type="checkbox" data-overwrite={file.id} disabled={saving} checked={Boolean(reviewed?.approved.includes(file.id))} onChange={(event) => {
                                if (!reviewed) return
                                const checked = event.currentTarget.checked
                                update({ review: { ...reviewed, approved: checked ? [...reviewed.approved.filter((id) => id !== file.id), file.id] : reviewed.approved.filter((id) => id !== file.id) } })
                            }} />
                            <span>{metadata ? `Overwrite the saved ${METADATA_FILE}` : 'Replace existing file'}</span>
                        </label>
                    </div>
                )
            })}
        </div>
        <div id="ta-reviewFoldersBox" className="review-note" hidden><strong>Folders created on save</strong><span id="ta-reviewFoldersNote">01_Inputs · 02_Evidences (initial, final and selected checkpoints) · 03_Data (01_SIMPATI, 02_Graphtec, 03_CANoe) · 04_Report</span></div>
        <label className="confirm-row"><input type="checkbox" id="ta-confirmCheck" disabled={saving || !reviewed} checked={value.confirmed} onChange={(event) => update({ confirmed: event.currentTarget.checked })} /><span>I have reviewed the destination and authorize creating folders and saving these files.</span></label>
        <div className="card-actions">{backButton}<button className="button primary" id="ta-saveButton" type="button" disabled={!canSave} onClick={() => pressToolboxRun(hostRef.current)}>Confirm & save files</button></div>
        <div id="ta-saveProgress" className="save-progress" aria-live="polite">{run.status === 'running' ? run.message : ''}</div>
    </>)

    const successCard = run.status === 'done' && (
        <section className="card success" id="ta-successCard">
            <div className="success-icon">✓</div>
            <span className="card-kicker">COMPLETE</span>
            <h2>Test files organized</h2>
            <p id="ta-successText">{run.result.saved.length === 0
                ? `Folders and evidence records updated in ${run.result.folderPath}. No new files were needed. `
                : `${run.result.saved.length} file${run.result.saved.length === 1 ? '' : 's'} saved in ${run.result.folderPath}. `}</p>
            <button className="button primary" id="ta-newTest" type="button" onClick={newTest}>Organize another test</button>
        </section>
    )

    const vibrationCards = [
        typeChoice,
        <VibrationWorkflow key="vibration-1" step={1} value={value} saving={saving} edit={edit} showStep={showStep} startReview={() => { void startReview() }} error={error} />,
        <VibrationWorkflow key="vibration-2" step={2} value={value} saving={saving} edit={edit} showStep={showStep} startReview={() => { void startReview() }} error={error} />,
        <VibrationWorkflow key="vibration-3" step={3} value={value} saving={saving} edit={edit} showStep={showStep} startReview={() => { void startReview() }} error={error} />,
        <VibrationWorkflow key="vibration-4" step={4} value={value} saving={saving} edit={edit} showStep={showStep} startReview={() => { void startReview() }} error={error} />,
        reviewCard,
    ]
    const cards = value.testType === 'vibration' ? vibrationCards : [typeChoice, detailsCard, inputsCard, evidenceStep, dataCard, reviewCard]
    const stepLabels = value.testType === 'vibration' ? VIBRATION_STEP_LABELS : CLIMATIC_STEP_LABELS
    const root = knownRoot || reviewed?.plan.root || ''

    return (
        <div ref={hostRef} className="test-atlas-host">
            <div className={`test-atlas${paused ? ' motion-paused' : ''}${overlay ? ' is-loading' : ''}`} data-atlas-step={success ? 6 : step}>
                <div className="ambient" aria-hidden="true">
                    <span className="ambient-orb ambient-orb-a" />
                    <span className="ambient-orb ambient-orb-b" />
                    <span className="ambient-grid" />
                </div>
                <div className="app-shell">
                    <aside className="sidebar">
                        <div className="brand"><span className="brand-mark" aria-hidden="true">↗</span><span><strong>TEST ATLAS</strong><small>Automotive workspace</small></span></div>
                        <div className="side-label">WORKFLOW</div>
                        <nav aria-label="Workflow steps" id="ta-stepNav">
                            {stepLabels.map((label, index) => (
                                <button
                                    key={label}
                                    type="button"
                                    data-step={index}
                                    className={`nav-step${index === step ? ' active' : ''}`}
                                    aria-current={index === step ? 'step' : undefined}
                                    disabled={saving || index > value.maxStep}
                                    onClick={() => { if (index === 5) void startReview(); else showStep(index) }}
                                >
                                    <span>{pad2(index + 1)}</span>{` ${label}`}
                                </button>
                            ))}
                        </nav>
                        <div className="sidebar-bottom">
                            <span className="status-dot" /> Project repository<br />
                            <span className="root-path ta-readonly" title="The project repository is configured on the Test Atlas server">{root || 'Configured on the Test Atlas server'}</span>
                        </div>
                    </aside>
                    <div className="ta-main">
                        <header className="topbar"><div>AUTOMOTIVE TESTS <span>/</span> FILE ORGANIZATION</div><div className="top-pill"><i /> SERVER WORKSPACE</div></header>
                        <div className="content">
                            <div className="page-head">
                                <div><div className="eyebrow">AUTOMOTIVE TEST FILE MANAGEMENT</div><h1>Organize test <br />files<span className="title-dot">.</span></h1><p>Set the test details, add files and review the destination before saving.</p></div>
                                <div className="step-count"><strong id="ta-stepCount">{pad2(step + 1)}</strong><span>/ 06</span></div>
                            </div>
                            <div className="progress" aria-hidden="true"><div id="ta-progressFill" style={{ width: `${((step + 1) / 6) * 100}%` }} /></div>
                            <div className="workspace-grid">
                                <div className="workspace-form">
                                    <div id="ta-message" ref={messageRef} role="alert" aria-live="assertive" hidden={!message} className={message?.info ? 'is-info' : undefined}>{message?.text}</div>
                                    {success && step === 5 ? successCard : cards[step]}
                                </div>
                                <VisualWorkspace state={visualState} paused={paused} onToggleMotion={() => setPaused((current) => !current)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {createPortal(
                <div className="test-atlas ta-layer">
                    {suggestions.panel}
                    <div id="ta-loadingOverlay" className="loading-overlay" role="alertdialog" aria-modal="true" aria-labelledby="ta-loadingTitle" aria-describedby="ta-loadingDetail" hidden={!overlay}>
                        <div className="loading-panel">
                            <div className="loading-spinner" aria-hidden="true" />
                            <strong id="ta-loadingTitle">{overlay?.title}</strong>
                            <p id="ta-loadingDetail">{overlay?.detail}</p>
                            <div className={`loading-bar${overlay?.progress === null ? ' indeterminate' : ''}`} aria-hidden="true">
                                <div id="ta-loadingBarFill" style={{ width: overlay && overlay.progress !== null ? `${Math.round(Math.min(1, Math.max(0, overlay.progress)) * 100)}%` : undefined }} />
                            </div>
                            <small id="ta-loadingCount" aria-live="polite">{overlay?.count}</small>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}
