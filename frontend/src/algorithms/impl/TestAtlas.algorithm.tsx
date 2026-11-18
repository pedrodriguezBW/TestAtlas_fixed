import { streamJson } from '../streamJson'
import { cancelTestAtlasUpload, createTestAtlasUpload, uploadTestAtlasFile } from '../testAtlasApi'
import { AlgorithmPlatform, AlgorithmRole, AlgorithmTag, type AlgorithmOutputProps, type AlgorithmStrategy } from '../types'
import { resultTreeText } from './testAtlas/planTree'
import { setRunState } from './testAtlas/runState'
import { TestAtlasApp } from './testAtlas/TestAtlasApp'
import {
    buildManifest,
    emptyTestAtlasConfig,
    formatBytes,
    storedFile,
    uploadList,
    validateTestAtlas,
    type TestAtlasConfig,
    type TestAtlasResult,
} from './testAtlasModel'
import './testAtlas/test-atlas.css'

// Test Atlas: organizes climatic and vibration test files, photographic evidence and
// measurement data in the project repository. The form keeps the original
// climate-file-organizer design (see ./testAtlas); the save is the TEST_ATLAS
// backend algorithm, started with the Toolbox Run button.

/** Toolbox Result panel: the saved destination and folder structure, in the review card style. */
function OutputView({ result }: AlgorithmOutputProps<TestAtlasConfig, TestAtlasResult>) {
    const separator = result.folderPath.includes('\\') ? '\\' : '/'
    const folder = result.folder.split(/[\\/]/).join(separator)
    const root = result.folderPath.endsWith(folder)
        ? result.folderPath.slice(0, result.folderPath.length - folder.length).replace(/[\\/]+$/, '')
        : result.folderPath
    return (
        <div className="test-atlas-host">
            <div className="test-atlas ta-output">
                <section className="card">
                    <div className="card-top">
                        <span className="card-kicker">SAVE RESULT</span>
                        <h2>Saved in the project repository</h2>
                        <p>{result.saved.length === 0
                            ? 'Folders and evidence records updated. No new files were needed.'
                            : `${result.saved.length} file${result.saved.length === 1 ? '' : 's'} saved in the planned folder structure.`}</p>
                    </div>
                    <div className="review-destination"><small>PROJECT DESTINATION</small><strong>{result.folder}</strong><span>{root}</span></div>
                    <div className="review-tree">
                        <div className="review-tree-heading"><strong>Folder structure</strong><span>{`${result.directories.length} folders`}</span></div>
                        <pre aria-label="Saved folder structure">{resultTreeText(result)}</pre>
                    </div>
                </section>
            </div>
        </div>
    )
}

const testAtlas: AlgorithmStrategy<TestAtlasConfig, TestAtlasResult> = {
    id: 'TEST_ATLAS',
    label: 'Test Atlas',
    description:
        'Organizes climatic and vibration test files, photographic evidence and measurement data into the standard folder structure of the project repository.',
    order: 10,
    platforms: [AlgorithmPlatform.FileRepository],
    roles: [AlgorithmRole.Anyone],
    tags: [AlgorithmTag.TestManagement],
    emptyConfig: emptyTestAtlasConfig,
    InputForm: TestAtlasApp,
    OutputView,
    validate: validateTestAtlas,
    execute: async (config, opts) => {
        const manifest = buildManifest(config)
        const approvedOverwrites = config.review?.approved ?? []
        const uploads = uploadList(config)
        const total = uploads.length + 1
        const totalBytes = uploads.reduce((sum, item) => sum + item.size, 0)
        setRunState({
            status: 'running',
            loading: { title: 'Saving test files', detail: 'Preparing the confirmed upload…', progress: null, count: '' },
            message: 'Preparing the confirmed upload…',
        })
        try {
            const upload = await createTestAtlasUpload(manifest, opts?.signal)
            try {
                let completedBytes = 0
                for (const [index, item] of uploads.entries()) {
                    const file = storedFile(item.id)
                    if (!file) throw new Error(`${item.name} is no longer available. Add it again and review the files.`)
                    opts?.onProgress?.({ current: index, total, message: `Uploading ${item.name}` })
                    const report = (loaded: number) => {
                        const done = totalBytes > 0
                            ? (completedBytes + loaded) / totalBytes
                            : (index + (loaded ? 1 : 0)) / uploads.length
                        setRunState({
                            status: 'running',
                            loading: {
                                title: 'Uploading files',
                                detail: item.name,
                                progress: done,
                                count: `File ${index + 1} of ${uploads.length} · ${formatBytes(completedBytes + loaded)} of ${formatBytes(totalBytes)}`,
                            },
                            message: `Uploading ${index + 1} of ${uploads.length}: ${item.name}`,
                        })
                    }
                    report(0)
                    await uploadTestAtlasFile(upload.id, item.id, file, report, opts?.signal)
                    completedBytes += item.size
                }
                setRunState({
                    status: 'running',
                    loading: {
                        title: 'Creating folders',
                        detail: 'Creating the directory structure and saving the files in the project repository…',
                        progress: null,
                        count: `${uploads.length} file${uploads.length === 1 ? '' : 's'} uploaded`,
                    },
                    message: 'Saving files to the project repository…',
                })
                opts?.onProgress?.({ current: uploads.length, total, message: 'Saving to the project repository' })
                const result = await streamJson<TestAtlasResult>(
                    '/api/scripts/TEST_ATLAS',
                    { ...manifest, uploadId: upload.id, approvedOverwrites },
                    opts,
                )
                setRunState({ status: 'done', result })
                return result
            } catch (failure) {
                await cancelTestAtlasUpload(upload.id).catch(() => undefined)
                throw failure
            }
        } catch (failure) {
            const aborted = failure instanceof DOMException && failure.name === 'AbortError'
            setRunState(aborted ? { status: 'idle' } : { status: 'failed', error: failure instanceof Error ? failure.message : String(failure) })
            throw failure
        }
    },
}

export default testAtlas
