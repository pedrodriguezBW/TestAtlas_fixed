// Test Atlas: types, naming rules and manifest building shared by the form,
// the strategy and their tests. Everything here is pure (no React, no fetch).

export type TestAtlasTestType = 'climatic' | 'vibration' | 'egr' | 'wind_tunnel'
export type DataCategory = 'inputs' | 'simpati' | 'graphtec' | 'canoe' | 'metadata'
export type EvidenceType = 'initial' | 'planned_inspection' | 'unplanned_stop' | 'incident' | 'restart' | 'final' | 'other'
export type ReferenceType = 'cycles' | 'hours' | 'stage' | 'date_time' | 'none'
export type DateSource = 'metadata' | 'modified' | 'test'

/** A browser file selected by the user; the File itself lives in the file store. */
export interface FileDescriptor {
    id: string
    name: string
    size: number
    mime: string
}

export interface DataFile extends FileDescriptor {
    category: DataCategory
}

export interface PhotoFile extends FileDescriptor {
    /** YYYY-MM-DDTHH:MM:SS, or null when the test date is used. */
    captureDate: string | null
    dateSource: DateSource
}

/** A photo already stored in the repository for a saved checkpoint. */
export interface SavedPhoto {
    name: string
    originalName: string
    size: number
    captureDate: string
    dateSource: string
    preview: boolean
}

export interface EvidenceSetConfig {
    id: string
    type: EvidenceType
    title: string
    referenceType: ReferenceType
    referenceValue: string
    notes: string
    /** Folder already saved in the repository (NN_Name), '' for a new checkpoint. */
    existingFolder: string
    savedPhotos: SavedPhoto[]
    photos: PhotoFile[]
}

/** Review returned by POST /api/test-atlas/plan. Paths use the Windows separator. */
export interface TestAtlasPlan {
    root: string
    folder: string
    directories: string[]
    existingWorkbooks: string[]
    generatedFiles: string[]
    renamedFolders: Array<{ from: string; to: string }>
    files: Array<{ id: string; name: string; category: string; size: number; relative: string; conflict: boolean }>
}

export interface ReviewState {
    /** Manifest the plan was calculated for; a different manifest makes the review stale. */
    key: string
    plan: TestAtlasPlan
    /** Identifiers of the conflicting files the user agreed to replace. */
    approved: string[]
}

export interface TestAtlasConfig {
    testType: TestAtlasTestType | null
    /** Wizard step on screen (0 = test type … 5 = review & save) and the furthest step reached. */
    step: number
    maxStep: number
    /** "I have reviewed the destination…" confirmation of step 06. */
    confirmed: boolean
    programNumber: string
    programName: string
    phase: string
    testNumber: string
    date: string
    /** Inputs workbooks already saved for this test (from the test state lookup). */
    existingInputs: string[]
    metadataExists: boolean
    files: DataFile[]
    evidenceSets: EvidenceSetConfig[]
    review: ReviewState | null
}

/** Result of the TEST_ATLAS run. */
export interface TestAtlasResult {
    folder: string
    folderPath: string
    saved: string[]
    directories: string[]
    generatedFiles: string[]
    renamedFolders: Array<{ from: string; to: string }>
}

/** JSON manifest shared by the review, the staging upload and the run. */
export interface TestAtlasManifest {
    testType: 'climatic'
    programNumber: string
    programName: string
    phase: string
    testNumber: string
    date: string
    files: Array<{ id: string; name: string; size: number; mime: string; category: DataCategory; captureDate: null }>
    evidenceSets: Array<{
        id: string
        type: EvidenceType
        title: string
        referenceType: ReferenceType
        referenceValue: string
        notes: string
        sequence: number
        existingFolder: string
        files: Array<{ id: string; name: string; size: number; mime: string; captureDate: string | null; dateSource: DateSource }>
    }>
}

export interface TestAtlasTestState {
    workbooks: string[]
    metadataExists: boolean
    evidence: Array<{
        folder: string
        type: EvidenceType
        title: string
        referenceType: ReferenceType
        referenceValue: string
        notes: string
        photos: SavedPhoto[]
    }>
}

export const MAX_FILES = 500
export const MAX_BYTES = 2 * 1024 * 1024 * 1024
export const METADATA_FILE = 'test_metadata.json'
export const METADATA_MAX_BYTES = 10 * 1024 * 1024
export const WORKBOOK_EXTENSIONS = ['xlsx', 'xlsm']
export const CANOE_EXTENSIONS = ['blf', 'asc', 'mf4', 'mdf', 'pcap', 'pcapng']
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'bmp', 'gif', 'dng']
export const PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']
export const DATA_CATEGORIES: readonly DataCategory[] = ['inputs', 'simpati', 'graphtec', 'canoe', 'metadata']

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
    initial: 'Initial condition',
    planned_inspection: 'Planned inspection',
    unplanned_stop: 'Unplanned stop',
    incident: 'Incident',
    restart: 'Restart',
    final: 'Final condition',
    other: 'Other',
}

export const CHECKPOINT_TYPES: readonly EvidenceType[] = ['planned_inspection', 'unplanned_stop', 'incident', 'restart', 'other']

export const REFERENCE_TYPE_LABELS: Record<ReferenceType, string> = {
    cycles: 'Cycles',
    hours: 'Hours',
    stage: 'Test stage',
    date_time: 'Date and time',
    none: 'No reference',
}

export const DATE_SOURCE_LABELS: Record<DateSource, string> = {
    metadata: 'photo metadata',
    modified: 'file modified date',
    test: 'test date',
}

export const newId = (): string => crypto.randomUUID()

/** Same folder/file component rules as the server's safePart. */
export const validPart = (value: string): boolean => {
    const trimmed = value.trim().replace(/\s+/g, ' ')
    return trimmed.length > 0
        && trimmed.length <= 90
        && !/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)
        && !/[. ]$/.test(trimmed)
        && !/^\.{1,2}$/.test(trimmed)
        && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(trimmed)
}

/** Validates a YYMMDD test date against the real calendar. */
export const dateProblem = (value: string): string | null => {
    if (!/^\d{6}$/.test(value)) return 'Test date must use YYMMDD.'
    const year = 2000 + Number(value.slice(0, 2))
    const month = Number(value.slice(2, 4))
    const day = Number(value.slice(4))
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
        return 'Enter a real test date in YYMMDD format.'
    }
    return null
}

export const fileExtension = (name: string): string => {
    const index = name.lastIndexOf('.')
    return index <= 0 ? '' : name.slice(index + 1).toLowerCase()
}

export const isSimpatiExtension = (extension: string): boolean => /^[xpb]\d{2}$/.test(extension)

export const isImageFile = (name: string, mime: string): boolean =>
    mime.startsWith('image/') || IMAGE_EXTENSIONS.includes(fileExtension(name))

export const canPreview = (name: string): boolean => PREVIEW_EXTENSIONS.includes(fileExtension(name))

/** Client-side check of a data file before it is added; mirrors the server messages. */
export const dataFileProblem = (file: { name: string; size: number }, category: DataCategory): string | null => {
    const extension = fileExtension(file.name)
    if (category === 'inputs' && !WORKBOOK_EXTENSIONS.includes(extension)) return `${file.name}: unsupported format`
    if (category === 'simpati' && !isSimpatiExtension(extension)) return `${file.name}: SIMPATI accepts .x01–.x99, .p01–.p99 and .b01–.b99 files`
    if (category === 'canoe' && !CANOE_EXTENSIONS.includes(extension)) return `${file.name}: CANoe accepts .blf, .asc, .mf4, .mdf, .pcap and .pcapng files`
    if (category === 'metadata') {
        if (file.name !== METADATA_FILE) return `${file.name}: the metadata file must be named exactly ${METADATA_FILE}`
        if (file.size > METADATA_MAX_BYTES) return `${file.name}: larger than 10 MB`
    }
    if (file.size > MAX_BYTES) return `${file.name}: larger than 2 GB`
    return null
}

export const formatBytes = (size: number): string => {
    if (size < 1024) return `${size} B`
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1048576).toFixed(1)} MB`
}

export const suggestedEvidenceTitle = (type: EvidenceType, referenceType: ReferenceType, referenceValue: string): string => {
    const typeLabels: Partial<Record<EvidenceType, string>> = {
        planned_inspection: 'Inspection',
        unplanned_stop: 'Unplanned stop',
        incident: 'Incident',
        restart: 'Restart',
        other: 'Other evidence',
    }
    const base = typeLabels[type] ?? 'Evidence'
    if (!referenceValue || referenceType === 'none') return base
    const references: Record<Exclude<ReferenceType, 'none'>, string> = {
        cycles: `after cycle ${referenceValue}`,
        hours: `after ${referenceValue} hours`,
        stage: `at stage ${referenceValue}`,
        date_time: `at ${referenceValue}`,
    }
    return `${base} ${references[referenceType]}`
}

const folderToken = (value: string): string => value.trim().replace(/\s+/g, '').replace(/_+/g, '-')

/** Folder each evidence set will have in 02_Evidences (mirrors the server). */
export const evidenceFolderName = (set: Pick<EvidenceSetConfig, 'type' | 'referenceType' | 'referenceValue' | 'existingFolder'>, position: number): string => {
    if (set.type === 'initial') return '00_Initial'
    if (set.type === 'final') return '99_Final'
    const sequence = String(position).padStart(2, '0')
    if (set.existingFolder) return `${sequence}${set.existingFolder.slice(2)}`
    const words: Record<EvidenceType, string> = {
        initial: 'Initial', planned_inspection: 'Inspection', unplanned_stop: 'UnplannedStop',
        incident: 'Incident', restart: 'Restart', final: 'Final', other: 'Other',
    }
    let reference = ''
    if (set.referenceType !== 'none' && set.referenceValue) {
        const token = folderToken(set.referenceValue)
        reference = set.referenceType === 'cycles' ? `${token}Cycles`
            : set.referenceType === 'hours' ? `${token}Hours`
                : set.referenceType === 'stage' ? `Stage-${token}`
                    : token.replace(/:/g, '-')
    }
    return [sequence, words[set.type], reference].filter(Boolean).join('_')
}

/** The date entered in Test details (YYMMDD), as a capture date at 00:00. */
export const testDateIso = (date: string): string | null =>
    /^\d{6}$/.test(date) ? `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4)}T00:00:00` : null

/** Effective date of a new photo; photos dated with the test date follow later edits of that date. */
export const photoDate = (photo: PhotoFile, date: string): string | null =>
    photo.dateSource === 'test' ? testDateIso(date) : photo.captureDate

export const emptyEvidenceSets = (): EvidenceSetConfig[] => [
    { id: newId(), type: 'initial', title: 'Initial condition', referenceType: 'none', referenceValue: '', notes: '', existingFolder: '', savedPhotos: [], photos: [] },
    { id: newId(), type: 'final', title: 'Final condition', referenceType: 'none', referenceValue: '', notes: '', existingFolder: '', savedPhotos: [], photos: [] },
]

export const emptyTestAtlasConfig = (): TestAtlasConfig => ({
    testType: null,
    step: 0,
    maxStep: 0,
    confirmed: false,
    programNumber: '',
    programName: '',
    phase: '',
    testNumber: '',
    date: '',
    existingInputs: [],
    metadataExists: false,
    files: [],
    evidenceSets: emptyEvidenceSets(),
    review: null,
})

export const detailsComplete = (config: Pick<TestAtlasConfig, 'programNumber' | 'programName' | 'phase' | 'testNumber'>): boolean =>
    [config.programNumber, config.programName, config.phase, config.testNumber].every(validPart)

/** Identifies the test the saved state belongs to. */
export const testKey = (config: Pick<TestAtlasConfig, 'programNumber' | 'programName' | 'phase' | 'testNumber'>): string =>
    [config.programNumber, config.programName, config.phase, config.testNumber].map((value) => value.trim().replace(/\s+/g, ' ')).join('\u0000')

export const destinationPreview = (config: Pick<TestAtlasConfig, 'programNumber' | 'programName' | 'phase' | 'testNumber'>): string => {
    const clean = (value: string, fallback: string) => value.trim().replace(/\s+/g, ' ') || fallback
    return `${clean(config.programNumber, 'Program number')} - ${clean(config.programName, 'Program name')} / ${clean(config.phase, 'Phase')} / TEST - ${clean(config.testNumber, 'Test number')}`
}

export const buildManifest = (config: TestAtlasConfig): TestAtlasManifest => ({
    testType: 'climatic',
    programNumber: config.programNumber.trim(),
    programName: config.programName.trim(),
    phase: config.phase.trim(),
    testNumber: config.testNumber.trim(),
    date: config.date.trim(),
    files: DATA_CATEGORIES.flatMap((category) => config.files
        .filter((file) => file.category === category)
        .map((file) => ({ id: file.id, name: file.name, size: file.size, mime: file.mime, category, captureDate: null as null }))),
    evidenceSets: config.evidenceSets.map((set, sequence) => ({
        id: set.id,
        type: set.type,
        title: set.title,
        referenceType: set.referenceType,
        referenceValue: set.referenceValue,
        notes: set.notes,
        sequence,
        existingFolder: set.existingFolder || '',
        files: set.photos.map((photo) => ({
            id: photo.id,
            name: photo.name,
            size: photo.size,
            mime: photo.mime,
            captureDate: photoDate(photo, config.date),
            dateSource: photo.dateSource,
        })),
    })),
})

/** Everything that changes the plan; a review made for a different key is stale. */
export const manifestKey = (config: TestAtlasConfig): string => JSON.stringify(buildManifest(config))

/** Every file that has to be uploaded, in manifest order. */
export const uploadList = (config: TestAtlasConfig): FileDescriptor[] => [
    ...DATA_CATEGORIES.flatMap((category) => config.files.filter((file) => file.category === category)),
    ...config.evidenceSets.flatMap((set) => set.photos),
]

/**
 * Merge the evidence folders saved in the repository into the evidence list.
 * Saved checkpoints keep the order chosen by the user; new ones found on disk
 * are inserted after the last saved checkpoint. Checkpoints that belonged to a
 * different test are dropped, or kept as new checkpoints if new photos were
 * added to them.
 */
export const mergeSavedEvidence = (
    sets: EvidenceSetConfig[],
    saved: TestAtlasTestState['evidence'],
    keyChanged: boolean,
): EvidenceSetConfig[] => {
    const byFolder = new Map(saved.map((set) => [set.folder.toLowerCase(), set]))
    const initial = { ...sets[0] }
    const final = { ...sets[sets.length - 1] }
    for (const [set, folder] of [[initial, '00_initial'], [final, '99_final']] as const) {
        const match = byFolder.get(folder)
        set.existingFolder = match ? match.folder : ''
        set.savedPhotos = match ? match.photos : []
        byFolder.delete(folder)
    }
    const kept: EvidenceSetConfig[] = []
    for (const original of sets.slice(1, -1)) {
        const set = { ...original }
        if (!set.existingFolder) {
            kept.push(set)
            continue
        }
        const match = keyChanged ? undefined : byFolder.get(set.existingFolder.toLowerCase())
        if (match) {
            set.existingFolder = match.folder
            set.savedPhotos = match.photos
            byFolder.delete(match.folder.toLowerCase())
            kept.push(set)
        } else {
            // The folder belongs to another test or no longer exists.
            set.existingFolder = ''
            set.savedPhotos = []
            if (set.photos.length) kept.push(set)
        }
    }
    const found: EvidenceSetConfig[] = saved
        .filter((set) => byFolder.has(set.folder.toLowerCase()))
        .map((set) => ({
            id: newId(),
            type: set.type,
            title: set.title,
            referenceType: set.referenceType || 'none',
            referenceValue: set.referenceValue || '',
            notes: set.notes || '',
            existingFolder: set.folder,
            savedPhotos: set.photos,
            photos: [],
        }))
    let insertAt = 0
    kept.forEach((set, index) => { if (set.existingFolder) insertAt = index + 1 })
    kept.splice(insertAt, 0, ...found)
    return [initial, ...kept, final]
}

/**
 * Run (the Toolbox button that saves) is enabled under the same conditions as
 * "Confirm & save files" in the original: climatic workflow, a review that
 * matches the current form, every existing file approved and the review confirmed.
 */
export const validateTestAtlas = (config: TestAtlasConfig): string[] => {
    if (config.testType !== 'climatic' || config.step < 5 || !config.review || config.review.key !== manifestKey(config)) {
        return ['Complete the Test Atlas steps and review the files before saving.']
    }
    const pending = config.review.plan.files.find((file) => file.conflict && !config.review?.approved.includes(file.id))
    if (pending) return [`Choose whether to replace ${pending.relative}.`]
    if (!config.confirmed) return ['Confirm the review to enable saving.']
    return []
}

// --------------------------------------------------------------------------
// File store: the selected File objects stay here, outside the config, so the
// configuration remains plain JSON and can be cloned by the execution view.

const files = new Map<string, File>()
const previews = new Map<string, string>()

export const registerFile = (file: File): FileDescriptor => {
    const id = newId()
    files.set(id, file)
    return { id, name: file.name, size: file.size, mime: file.type }
}

export const storedFile = (id: string): File | undefined => files.get(id)

export const previewUrl = (id: string): string => {
    const file = files.get(id)
    if (!file || !canPreview(file.name) || typeof URL.createObjectURL !== 'function') return ''
    let url = previews.get(id)
    if (!url) {
        url = URL.createObjectURL(file)
        previews.set(id, url)
    }
    return url
}

export const releaseFile = (id: string): void => {
    files.delete(id)
    const url = previews.get(id)
    if (url) {
        previews.delete(id)
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
}
