import { useEffect, useRef, useState } from 'react'
import { fetchVibrationSampleInputs } from '../../testAtlasApi'
import {
    CANOE_EXTENSIONS,
    CHECKPOINT_TYPES,
    EVIDENCE_TYPE_LABELS,
    MAX_BYTES,
    METADATA_FILE,
    METADATA_MAX_BYTES,
    REFERENCE_TYPE_LABELS,
    dateProblem,
    emptyVibrationEvidenceSet,
    emptyVibrationSample,
    emptyVibrationTest,
    evidenceFolderName,
    fileExtension,
    formatBytes,
    registerFile,
    releaseFile,
    validPart,
    vibrationBatchFolder,
    vibrationIssue,
    vibrationSampleFiles,
    vibrationSampleFolder,
    vibrationTestFolderName,
    vibrationWorkbookStem,
    type EvidenceType,
    type FileDescriptor,
    type ReferenceType,
    type TestAtlasConfig,
    type VibrationEvidenceSet,
    type VibrationSampleConfig,
    type VibrationTestConfig,
} from '../testAtlasModel'

type Patch = Partial<TestAtlasConfig>

interface Props {
    step: number
    value: TestAtlasConfig
    saving: boolean
    edit: (patch: Patch) => void
    showStep: (step: number, patch?: Patch) => void
    startReview: () => void
    error: (message: string) => void
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
/** "TEST - <code> - <type> - <axis>" folder of a vibration test. */
export const vibrationTestFolder = (test: VibrationTestConfig) => vibrationTestFolderName(test)

const workbook = (file: File) => ['xlsx', 'xlsm'].includes(fileExtension(file.name))
const image = (file: File) => file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'bmp', 'gif', 'dng', 'svg', 'ico'].includes(fileExtension(file.name))

const canoeProblem = (file: File) => CANOE_EXTENSIONS.includes(fileExtension(file.name))
    ? null : `${file.name}: CANoe accepts .blf, .asc, .mf4, .mdf, .pcap and .pcapng files.`
const metadataProblem = (file: File) => file.name !== METADATA_FILE
    ? `${file.name}: the metadata file must be named exactly ${METADATA_FILE}.`
    : file.size > METADATA_MAX_BYTES ? `${file.name}: larger than 10 MB.` : null

function UploadPanel({ title, help, files, saving, workbookOnly = false, photosOnly = false, single = false, folder = false, accept, check, onChange, error }: {
    title: string
    help: string
    files: FileDescriptor[]
    saving: boolean
    workbookOnly?: boolean
    photosOnly?: boolean
    /** Only one file (it replaces the previous one). Workbooks are always single. */
    single?: boolean
    folder?: boolean
    accept?: string
    check?: (file: File) => string | null
    onChange: (files: FileDescriptor[]) => void
    error: (message: string) => void
}) {
    const one = workbookOnly || single
    const fileRef = useRef<HTMLInputElement | null>(null)
    const folderRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        if (folderRef.current) folderRef.current.setAttribute('webkitdirectory', '')
    }, [])
    const add = (selected: File[]) => {
        const next = one ? [] : [...files]
        const problems: string[] = []
        for (const file of selected) {
            if (file.size > MAX_BYTES) { problems.push(`${file.name}: exceeds 2 GB.`); continue }
            if (workbookOnly && !workbook(file)) { problems.push(`${file.name}: choose an .xlsx or .xlsm workbook.`); continue }
            if (photosOnly && !image(file)) { problems.push(`${file.name}: choose an image. Other files belong to 03_Data.`); continue }
            const problem = check?.(file)
            if (problem) { problems.push(problem); continue }
            if (!one && next.some((item) => item.name.toLowerCase() === file.name.toLowerCase())) { problems.push(`${file.name}: already selected in this category.`); continue }
            next.push(registerFile(file))
            if (one) break
        }
        if (one && !next.length) {
            // An invalid replacement keeps the file already selected.
            if (problems.length) error(problems.join(' · '))
            return
        }
        if (one && files[0] && next[0].id !== files[0].id) releaseFile(files[0].id)
        if (next.length !== files.length || next.some((item, index) => item.id !== files[index]?.id)) onChange(next)
        if (problems.length) error(problems.join(' · '))
    }
    const remove = (id: string) => {
        releaseFile(id)
        onChange(files.filter((file) => file.id !== id))
    }
    const input = (ref: typeof fileRef, asFolder = false) => (
        <input
            ref={ref}
            type="file"
            hidden
            multiple={!one}
            accept={accept ?? (workbookOnly ? '.xlsx,.xlsm' : photosOnly ? 'image/*,.tif,.tiff,.heic,.heif,.avif,.dng,.svg,.ico' : undefined)}
            onChange={(event) => {
                add(Array.from(event.currentTarget.files ?? []))
                event.currentTarget.value = ''
            }}
            {...(asFolder ? { 'data-folder-input': true } : {})}
        />
    )
    return (
        <div className="data-row v-upload">
            <div><strong>{title}</strong><small>{help}</small></div>
            <div className="upload-buttons">
                <button className="button secondary" type="button" disabled={saving} onClick={() => fileRef.current?.click()}>{workbookOnly ? 'Choose workbook' : single ? 'Choose file' : 'Add files'}</button>
                {folder && <button className="button subtle" type="button" disabled={saving} onClick={() => folderRef.current?.click()}>Add folder</button>}
                {input(fileRef)}
                {folder && input(folderRef, true)}
            </div>
            <div className="file-list">
                {files.map((file) => (
                    <div className="file-item" key={file.id}>
                        <span className="file-icon">▤</span><span className="file-main">{file.name}</span><small>{formatBytes(file.size)}</small>
                        <button type="button" disabled={saving} aria-label={`Remove ${file.name}`} onClick={() => remove(file.id)}>×</button>
                    </div>
                ))}
            </div>
        </div>
    )
}

const back = (saving: boolean, onClick: () => void) => <button className="button ghost" type="button" disabled={saving} onClick={onClick}>Back</button>

const REFERENCE_TYPES: readonly ReferenceType[] = ['cycles', 'hours', 'stage', 'date_time', 'none']

/** Evidence checkpoints of one sample: Initial first, Final last, numbered checkpoints in between. */
function EvidenceEditor({ sets, saving, error, onChange }: {
    sets: VibrationEvidenceSet[]
    saving: boolean
    error: (message: string) => void
    onChange: (sets: VibrationEvidenceSet[]) => void
}) {
    const update = (id: string, patch: Partial<VibrationEvidenceSet>) => onChange(sets.map((set) => set.id === id ? { ...set, ...patch } : set))
    const remove = (set: VibrationEvidenceSet) => {
        set.photos.forEach((photo) => releaseFile(photo.id))
        onChange(sets.filter((item) => item.id !== set.id))
    }
    const add = () => onChange([...sets.slice(0, -1), emptyVibrationEvidenceSet(), sets[sets.length - 1]])
    return (
        <div className="v-evidence">
            <div className="v-block-title"><strong>02_Evidences · photo checkpoints</strong><small>00_Initial and 99_Final are always created. Photos keep their original names; files that are not images go to 03_Data.</small></div>
            {sets.map((set, index) => {
                const fixed = set.type === 'initial' || set.type === 'final'
                const folder = evidenceFolderName({ ...set, existingFolder: '' }, index)
                return (
                    <div className="v-checkpoint" key={set.id} data-checkpoint={set.type}>
                        {!fixed && (
                            <div className="form-grid v-checkpoint-fields">
                                <label>Checkpoint type<select disabled={saving} value={set.type} onChange={(event) => update(set.id, { type: event.currentTarget.value as EvidenceType })}>
                                    {CHECKPOINT_TYPES.map((type) => <option key={type} value={type}>{EVIDENCE_TYPE_LABELS[type]}</option>)}
                                </select></label>
                                <label>Reference<select disabled={saving} value={set.referenceType} onChange={(event) => update(set.id, { referenceType: event.currentTarget.value as ReferenceType })}>
                                    {REFERENCE_TYPES.map((type) => <option key={type} value={type}>{REFERENCE_TYPE_LABELS[type]}</option>)}
                                </select></label>
                                {set.referenceType !== 'none' && <label>Reference value *<input maxLength={50} disabled={saving} placeholder={set.referenceType === 'cycles' ? 'e.g. 250' : set.referenceType === 'stage' ? 'e.g. Resonance' : ''} value={set.referenceValue} onChange={(event) => update(set.id, { referenceValue: event.currentTarget.value })} /></label>}
                                <button className="button ghost" type="button" disabled={saving} onClick={() => remove(set)}>Remove checkpoint</button>
                            </div>
                        )}
                        <UploadPanel
                            title={`${fixed ? EVIDENCE_TYPE_LABELS[set.type] : 'Checkpoint'} · ${fixed ? folder : folder.replace(/^\d{2}/, 'NN')}`}
                            help={fixed ? 'Optional photos. The folder is created even when it is empty.' : 'NN is assigned after the checkpoints already saved for this sample.'}
                            files={set.photos}
                            photosOnly
                            saving={saving}
                            error={error}
                            onChange={(photos) => update(set.id, { photos })}
                        />
                    </div>
                )
            })}
            <button className="button secondary" type="button" disabled={saving} onClick={add}>+ Add checkpoint</button>
        </div>
    )
}

export function VibrationWorkflow({ step, value, saving, edit, showStep, startReview, error }: Props) {
    const [selectedTest, setSelectedTest] = useState('')
    const [selectedSample, setSelectedSample] = useState('')
    const [existing, setExisting] = useState<{ loading: boolean; names: string[]; failed: boolean }>({ loading: false, names: [], failed: false })

    const tests = value.vibrationTests
    const currentTest = tests.find((test) => test.id === selectedTest) ?? tests[0]
    const currentSample = currentTest?.materialMasters.find((sample) => sample.id === selectedSample) ?? currentTest?.materialMasters[0]

    useEffect(() => {
        if (currentTest && currentTest.id !== selectedTest) setSelectedTest(currentTest.id)
        if (currentSample && currentSample.id !== selectedSample) setSelectedSample(currentSample.id)
    }, [currentSample, currentTest, selectedSample, selectedTest])

    const updateTests = (next: VibrationTestConfig[]) => edit({ vibrationTests: next })
    const updateTest = (testId: string, next: VibrationTestConfig) => updateTests(tests.map((test) => test.id === testId ? next : test))
    const updateSample = (testId: string, sampleId: string, patch: Partial<VibrationSampleConfig>) => {
        const test = tests.find((item) => item.id === testId)
        if (!test) return
        updateTest(testId, { ...test, materialMasters: test.materialMasters.map((sample) => sample.id === sampleId ? { ...sample, ...patch } : sample) })
    }

    const detailsValid = () => {
        for (const [key, label] of [['programNumber', 'program number'], ['programName', 'program name'], ['phase', 'phase'], ['batchName', 'batch name']] as const) {
            if (!validPart(value[key].trim())) { error(`Enter a valid ${label}. Avoid /, \\, and other path characters.`); return false }
        }
        const badDate = dateProblem(value.date.trim())
        if (badDate) { error(badDate); return false }
        return true
    }
    const structureValid = () => {
        const draft = { ...value, testType: 'vibration' as const, inputsWorkbook: value.inputsWorkbook ?? { id: 'validation', name: 'validation.xlsx', size: 0, mime: '' } }
        const issue = vibrationIssue(draft)
        if (issue && issue.step === 3) { error(issue.message); return false }
        return true
    }

    useEffect(() => {
        if (step !== 4 || !currentTest || !currentSample || !detailsValidForLookup(value, currentTest, currentSample)) {
            setExisting({ loading: false, names: [], failed: false })
            return undefined
        }
        const controller = new AbortController()
        setExisting({ loading: true, names: [], failed: false })
        void fetchVibrationSampleInputs({
            programNumber: value.programNumber,
            programName: value.programName,
            phase: value.phase,
            batchName: value.batchName,
            testCode: currentTest.testCode,
            testType: currentTest.vibrationType,
            axis: currentTest.axis,
            materialMasterCode: currentSample.materialMasterCode,
        }, controller.signal).then((result) => {
            setExisting({ loading: false, names: result.workbooks ?? [], failed: false })
        }).catch((failure) => {
            if (!(failure instanceof DOMException && failure.name === 'AbortError')) setExisting({ loading: false, names: [], failed: true })
        })
        return () => controller.abort()
    }, [currentSample, currentTest, step, value.batchName, value.phase, value.programName, value.programNumber])

    const destination = `${clean(value.programNumber) || 'ProgramNumber'} - ${clean(value.programName) || 'ProgramName'} / ${clean(value.phase) || 'Phase'} / ${vibrationBatchFolder(clean(value.batchName) || 'Batch')}`
    const batchWorkbook = `${vibrationWorkbookStem({ ...value, date: clean(value.date) || 'YYMMDD' })}.xlsx / .xlsm`

    if (step === 1) return (
        <section className="card card-enter" data-vibration-card="1" aria-labelledby="ta-v-heading1">
            <div className="card-top"><span className="card-kicker">STEP 02 · VIBRATION BATCH</span><h2 id="ta-v-heading1">Identify the batch</h2><p>Set the program, phase, batch and date. All vibration tests in this session belong to this batch. Field values are free text; Test Atlas adds the separators.</p></div>
            <div className="form-grid">
                {([
                    ['programNumber', 'Program number', 'e.g. 0000'], ['programName', 'Program name', 'e.g. Example'],
                    ['phase', 'Phase', 'e.g. DV'], ['batchName', 'Batch', 'e.g. 01 - Validation'],
                ] as const).map(([key, label, placeholder]) => (
                    <label key={key}>{label} <span className="required">*</span><input maxLength={90} autoComplete="off" placeholder={placeholder} disabled={saving} value={value[key]} onChange={(event) => edit({ [key]: event.currentTarget.value })} /></label>
                ))}
                <label>Date (YYMMDD) <span className="required">*</span><input maxLength={6} inputMode="numeric" autoComplete="off" placeholder="e.g. 260501" disabled={saving} value={value.date} onChange={(event) => edit({ date: event.currentTarget.value.replace(/\D/g, '') })} /></label>
            </div>
            <div className="folder-preview"><div className="preview-title">BATCH DESTINATION</div><div>{destination}</div></div>
            <div className="card-actions">{back(saving, () => showStep(0))}<button className="button primary" type="button" disabled={saving} onClick={() => { if (detailsValid()) showStep(2) }}>Continue</button></div>
        </section>
    )

    if (step === 2) return (
        <section className="card card-enter" data-vibration-card="2" aria-labelledby="ta-v-heading2">
            <div className="card-top"><span className="card-kicker">STEP 03 · BATCH INPUTS</span><h2 id="ta-v-heading2">Add the batch workbook</h2><p>This general inputs workbook belongs directly to the batch, alongside its test folders. It is renamed from the batch details and keeps its extension.</p></div>
            <UploadPanel title="General batch inputs *" help={`.xlsx or .xlsm · saved in the batch as ${batchWorkbook}`} files={value.inputsWorkbook ? [value.inputsWorkbook] : []} workbookOnly saving={saving} error={error} onChange={(files) => edit({ inputsWorkbook: files[0] ?? null })} />
            <div className="note">Each Material Master needs a specific inputs workbook in step 05. You can upload it or reuse a workbook already saved in its 01_Inputs folder.</div>
            <div className="card-actions">{back(saving, () => showStep(1))}<button className="button primary" type="button" disabled={saving} onClick={() => value.inputsWorkbook ? showStep(3) : error('Select one batch inputs .xlsx or .xlsm workbook.')}>Continue</button></div>
        </section>
    )

    if (step === 3) return (
        <section className="card card-enter" data-vibration-card="3" aria-labelledby="ta-v-heading3">
            <div className="card-top"><span className="card-kicker">STEP 04 · TESTS & SAMPLES</span><h2 id="ta-v-heading3">Define tests and Material Masters</h2><p>Add each test, then its samples. Material Masters are stored inside their test folder.</p></div>
            <div className="v-tests">
                {tests.map((test, index) => (
                    <article className="v-test-card" key={test.id}>
                        <div className="v-test-header"><strong>{`TEST ${String(index + 1).padStart(2, '0')}`}</strong><button className="button ghost" type="button" disabled={saving} onClick={() => {
                            test.materialMasters.flatMap(vibrationSampleFiles).forEach((file) => releaseFile(file.id))
                            updateTests(tests.filter((item) => item.id !== test.id))
                        }}>Remove test</button></div>
                        <div className="form-grid v-test-fields">
                            {([
                                ['testCode', 'Test code *', 'IN260501-01'], ['vibrationType', 'Test type *', 'FSweep'], ['axis', 'Axis *', 'Z'],
                            ] as const).map(([key, label, placeholder]) => <label key={key}>{label}<input maxLength={90} placeholder={placeholder} disabled={saving} value={test[key]} onChange={(event) => updateTest(test.id, { ...test, [key]: event.currentTarget.value, materialMasters: test.materialMasters.map((sample) => ({ ...sample, existingWorkbook: '' })) })} /></label>)}
                        </div>
                        <div className="v-test-path">{vibrationTestFolder(test)}</div>
                        <div className="v-samples">
                            {test.materialMasters.map((sample) => (
                                <div className="v-sample-row" key={sample.id}>
                                    <label>Material Master *<input maxLength={90} placeholder="e.g. ABC12345" disabled={saving} value={sample.materialMasterCode} onChange={(event) => updateSample(test.id, sample.id, { materialMasterCode: event.currentTarget.value, existingWorkbook: '' })} /></label>
                                    <small>{`${vibrationSampleFolder(sample.materialMasterCode)} · ${vibrationSampleFiles(sample).length} selected files`}</small>
                                    <button className="button ghost" type="button" disabled={saving} onClick={() => { vibrationSampleFiles(sample).forEach((file) => releaseFile(file.id)); updateTest(test.id, { ...test, materialMasters: test.materialMasters.filter((item) => item.id !== sample.id) }) }}>Remove sample</button>
                                </div>
                            ))}
                        </div>
                        <button className="button secondary" type="button" disabled={saving} onClick={() => updateTest(test.id, { ...test, materialMasters: [...test.materialMasters, emptyVibrationSample()] })}>+ Add Material Master</button>
                    </article>
                ))}
            </div>
            <button className="button secondary" type="button" disabled={saving} onClick={() => updateTests([...tests, emptyVibrationTest()])}>+ Add test</button>
            <div className="card-actions">{back(saving, () => showStep(2))}<button className="button primary" type="button" disabled={saving} onClick={() => { if (structureValid()) showStep(4) }}>Continue</button></div>
        </section>
    )

    if (!currentTest || !currentSample) return <section className="card"><p>Add a test and a Material Master before assigning files.</p>{back(saving, () => showStep(3))}</section>

    const setFiles = (key: 'results' | 'characterization' | 'canoe', files: FileDescriptor[]) => updateSample(currentTest.id, currentSample.id, { [key]: files })
    const photoCount = currentSample.evidenceSets.reduce((total, set) => total + set.photos.length, 0)
    const counts = `This sample · Inputs: ${currentSample.inputsWorkbook || currentSample.existingWorkbook ? 1 : 0} · Checkpoints: ${currentSample.evidenceSets.length} · Photos: ${photoCount} · Results: ${currentSample.results.length} · Characterization: ${currentSample.characterization.length} · CANoe: ${currentSample.canoe.length} · Metadata: ${currentSample.metadata ? 1 : 0}`
    const sampleWorkbook = `${vibrationWorkbookStem(value, currentTest)}.xlsx / .xlsm`
    return (
        <section className="card card-enter" id="ta-vibrationWorkflow" data-vibration-card="4" aria-labelledby="ta-v-heading4">
            <div className="card-top"><span className="card-kicker">STEP 05 · SAMPLE FILES</span><h2 id="ta-v-heading4">Assign files to each sample</h2><p>Select the test and Material Master before adding files. Every sample gets 01_Inputs, 02_Evidences, 03_Data and 04_Report, like a climatic test.</p></div>
            <div className="form-grid v-context-selectors">
                <label>Test<select value={currentTest.id} disabled={saving} onChange={(event) => { setSelectedTest(event.currentTarget.value); setSelectedSample('') }}>{tests.map((test) => <option value={test.id} key={test.id}>{vibrationTestFolder(test)}</option>)}</select></label>
                <label>Material Master<select value={currentSample.id} disabled={saving} onChange={(event) => setSelectedSample(event.currentTarget.value)}>{currentTest.materialMasters.map((sample) => <option value={sample.id} key={sample.id}>{vibrationSampleFolder(sample.materialMasterCode)}</option>)}</select></label>
            </div>
            <div className="v-file-context"><strong>{vibrationSampleFolder(currentSample.materialMasterCode)}</strong><small>{`${destination} / ${vibrationTestFolder(currentTest)} / ${vibrationSampleFolder(currentSample.materialMasterCode)}`}</small></div>
            <UploadPanel title="01_Inputs · sample inputs workbook *" help={`.xlsx or .xlsm · specific test conditions · saved as ${sampleWorkbook}`} files={currentSample.inputsWorkbook ? [currentSample.inputsWorkbook] : []} workbookOnly saving={saving} error={error} onChange={(files) => updateSample(currentTest.id, currentSample.id, { inputsWorkbook: files[0] ?? null, existingWorkbook: files.length ? '' : currentSample.existingWorkbook })} />
            <div className="v-existing-inputs">
                <small>{existing.loading ? 'Checking for an existing sample inputs workbook…' : existing.failed ? 'Existing workbooks could not be checked. Upload a workbook or return to this step to retry.' : existing.names.length ? 'An inputs workbook already exists in 01_Inputs. Select it to keep it, or upload another workbook.' : 'No existing inputs workbook found. Select an .xlsx or .xlsm file for this sample.'}</small>
                {existing.names.length > 0 && <select aria-label="Existing sample inputs workbook" disabled={saving} value={currentSample.existingWorkbook} onChange={(event) => {
                    if (currentSample.inputsWorkbook && event.currentTarget.value) releaseFile(currentSample.inputsWorkbook.id)
                    updateSample(currentTest.id, currentSample.id, { existingWorkbook: event.currentTarget.value, inputsWorkbook: event.currentTarget.value ? null : currentSample.inputsWorkbook })
                }}><option value="">Select an existing workbook</option>{existing.names.map((name) => <option key={name} value={name}>{name}</option>)}</select>}
            </div>
            <EvidenceEditor sets={currentSample.evidenceSets} saving={saving} error={error} onChange={(evidenceSets) => updateSample(currentTest.id, currentSample.id, { evidenceSets })} />
            <div className="v-block-title"><strong>03_Data</strong><small>Everything that is not a photo: results, logs, alarms, characterization and CANoe files.</small></div>
            <UploadPanel title="Results · 03_Data\01_Results" help="Results, exports, spreadsheets, CSV, logs, alarms and plots. Any file format." files={currentSample.results} folder saving={saving} error={error} onChange={(files) => setFiles('results', files)} />
            <UploadPanel title="Characterization · 03_Data\02_Characterization" help=".swp2 files and any related exports, graphs or comparisons." files={currentSample.characterization} folder saving={saving} error={error} onChange={(files) => setFiles('characterization', files)} />
            <UploadPanel title="CANoe · 03_Data\03_CANoe" help=".blf, .asc, .mf4, .mdf, .pcap or .pcapng logging files." files={currentSample.canoe} accept=".blf,.asc,.mf4,.mdf,.pcap,.pcapng" check={canoeProblem} saving={saving} error={error} onChange={(files) => setFiles('canoe', files)} />
            <UploadPanel title={`Report · 04_Report\\${METADATA_FILE}`} help={`Optional. The file must be named exactly ${METADATA_FILE} (max. 10 MB).`} files={currentSample.metadata ? [currentSample.metadata] : []} single accept=".json" check={metadataProblem} saving={saving} error={error} onChange={(files) => updateSample(currentTest.id, currentSample.id, { metadata: files[0] ?? null })} />
            <div className="note v-counts">{counts}</div>
            <div className="card-actions">{back(saving, () => showStep(3))}<button className="button primary" type="button" disabled={saving} onClick={startReview}>Review structure</button></div>
        </section>
    )
}

function detailsValidForLookup(config: TestAtlasConfig, test: VibrationTestConfig, sample: VibrationSampleConfig) {
    return [config.programNumber, config.programName, config.phase, config.batchName, test.testCode, test.vibrationType, test.axis, sample.materialMasterCode].every((value) => validPart(value.trim()))
}
