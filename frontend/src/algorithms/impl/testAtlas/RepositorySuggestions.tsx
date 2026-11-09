import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { fetchTestAtlasSuggestions, type TestAtlasSuggestions } from '../../testAtlasApi'

// Repository autocomplete of the original Test Atlas (public/suggestions.js):
// a pop-up listing the program, phase and test folders already present in the
// project repository. The pop-up is fixed-positioned next to the active field
// and rendered outside the cards so it is never clipped.

export type SuggestionField = 'programNumber' | 'programName' | 'phase' | 'testNumber'
type Details = Record<SuggestionField, string>

const CONFIG: Record<SuggestionField, [string, string]> = {
    programNumber: ['Existing programs', 'Search by program number or name'],
    programName: ['Existing programs', 'Search by program name or number'],
    phase: ['Existing phases', 'Phases in the selected program'],
    testNumber: ['Existing tests', 'Tests in the selected program and phase'],
}
const FIELDS = Object.keys(CONFIG) as SuggestionField[]
const LIST_ID = 'ta-climaticRepositorySuggestions'
const spaced = (key: string) => key.replace(/([A-Z])/g, ' $1')

interface Option {
    value: string
    detail: string
    program?: { number: string; name: string }
}

export function useRepositorySuggestions({ values, onChoose }: {
    values: Details
    onChoose: (patch: Partial<Details>) => void
}) {
    const [active, setActive] = useState<SuggestionField | null>(null)
    const [options, setOptions] = useState<Option[]>([])
    const [status, setStatus] = useState<string | null>(null)
    const [selected, setSelected] = useState(-1)
    const inputs = useRef<Partial<Record<SuggestionField, HTMLInputElement | null>>>({})
    const popup = useRef<HTMLDivElement | null>(null)
    const list = useRef<HTMLDivElement | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const request = useRef<AbortController | null>(null)
    const generation = useRef(0)
    const latest = useRef({ values, active, options, selected, onChoose })
    latest.current = { values, active, options, selected, onChoose }

    const close = useCallback(() => {
        clearTimeout(timer.current)
        request.current?.abort()
        generation.current++
        setActive(null)
        setSelected(-1)
    }, [])

    const message = useCallback((text: string) => {
        setOptions([])
        setSelected(-1)
        setStatus(text)
    }, [])

    const render = useCallback((key: SuggestionField, data: TestAtlasSuggestions) => {
        const current = latest.current.values
        const query = (inputs.current[key]?.value ?? '').trim().toLowerCase()
        let next: Option[]
        if (key === 'programNumber' || key === 'programName') {
            next = (data.programs || []).map((program) => ({
                value: key === 'programNumber' ? program.number : program.name,
                detail: key === 'programNumber' ? program.name : `Program ${program.number}`,
                program,
            }))
        } else {
            next = [...new Set(key === 'phase' ? data.phases || [] : data.tests || [])]
                .filter((value) => value.toLowerCase().includes(query))
                .map((value) => ({
                    value,
                    detail: key === 'phase'
                        ? `${current.programNumber} - ${current.programName}`
                        : `${current.programName} / ${current.phase || 'All phases'}`,
                }))
        }
        setSelected(-1)
        if (!next.length) {
            message('No matching folders. You can enter a new value.')
            return
        }
        setStatus(null)
        setOptions(next)
    }, [message])

    const load = useCallback(async (key: SuggestionField) => {
        request.current?.abort()
        const controller = new AbortController()
        request.current = controller
        const current = ++generation.current
        const details = latest.current.values
        const program = details.programNumber.trim() && details.programName.trim()
            ? `${details.programNumber.trim()} - ${details.programName.trim()}` : ''
        if ((key === 'phase' || key === 'testNumber') && !program) {
            message('Enter the program number and name to search existing folders.')
            return
        }
        message('Searching the project repository…')
        try {
            const data = await fetchTestAtlasSuggestions({
                q: (inputs.current[key]?.value ?? '').trim(),
                program,
                phase: details.phase.trim(),
            }, controller.signal)
            if (generation.current === current && latest.current.active === key) render(key, data)
        } catch (failure) {
            if (generation.current === current && latest.current.active === key
                && !(failure instanceof DOMException && failure.name === 'AbortError')) {
                message('Suggestions are unavailable. You can still enter a value.')
            }
        }
    }, [message, render])

    const open = useCallback((key: SuggestionField, delay = 0) => {
        if (latest.current.active !== key) close()
        setActive(key)
        latest.current.active = key
        message(CONFIG[key][1])
        clearTimeout(timer.current)
        request.current?.abort()
        generation.current++
        timer.current = setTimeout(() => { void load(key) }, delay)
    }, [close, load, message])

    const choose = useCallback((index: number) => {
        const { options: current, active: key } = latest.current
        const option = current[index]
        if (!option || !key) return
        const input = inputs.current[key]
        latest.current.onChoose(option.program
            ? { programNumber: option.program.number, programName: option.program.name }
            : { [key]: option.value })
        close()
        input?.focus({ preventScroll: true })
    }, [close])

    // Keep the pop-up beside the active field (below it, or above when there is no room).
    const position = useCallback(() => {
        const key = latest.current.active
        const input = key ? inputs.current[key] : null
        const panel = popup.current
        if (!input || !panel || !list.current) return
        const bounds = input.getBoundingClientRect()
        if (bounds.bottom < 0 || bounds.top > window.innerHeight || input.closest('[hidden]')) {
            close()
            return
        }
        // Never wider than the card that holds the field (nor the window).
        const card = input.closest('.card')?.getBoundingClientRect()
        const frame = card && card.width > 0 ? card : null
        const minLeft = Math.max(12, frame ? frame.left : 12)
        const maxRight = Math.min(window.innerWidth - 12, frame ? frame.right : window.innerWidth - 12)
        const width = Math.max(0, Math.min(Math.max(bounds.width, 280), maxRight - minLeft))
        panel.style.width = `${width}px`
        panel.style.left = `${Math.min(Math.max(minLeft, bounds.left), maxRight - width)}px`
        const below = window.innerHeight - bounds.bottom - 16
        const above = bounds.top - 16
        const upwards = below < 190 && above > below
        const available = Math.max(90, Math.min(350, upwards ? above : below))
        list.current.style.maxHeight = `${Math.max(40, available - 88)}px`
        panel.style.top = `${upwards ? Math.max(8, bounds.top - panel.offsetHeight - 6) : bounds.bottom + 6}px`
    }, [close])

    useLayoutEffect(() => { if (active) position() }, [active, options, status, position])

    useEffect(() => {
        if (!active) return undefined
        const outside = (event: PointerEvent) => {
            const target = event.target as Node
            const field = inputs.current[active]?.parentElement
            if (!popup.current?.contains(target) && !field?.contains(target)) close()
        }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('scroll', position, true)
        window.addEventListener('resize', position)
        return () => {
            document.removeEventListener('pointerdown', outside)
            document.removeEventListener('scroll', position, true)
            window.removeEventListener('resize', position)
        }
    }, [active, close, position])

    useEffect(() => () => {
        clearTimeout(timer.current)
        request.current?.abort()
    }, [])

    const highlight = (index: number) => {
        setSelected(index)
        const row = list.current?.children[index] as HTMLElement | undefined
        row?.scrollIntoView?.({ block: 'nearest' })
    }

    const onKeyDown = (key: SuggestionField) => (event: KeyboardEvent<HTMLInputElement>) => {
        const isOpen = active === key
        if (event.key === 'Escape') {
            if (isOpen) {
                event.preventDefault()
                close()
            }
            return
        }
        if (event.key === 'Tab') {
            close()
            return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!isOpen) {
                open(key)
                return
            }
            if (options.length) {
                highlight(event.key === 'ArrowDown'
                    ? (selected + 1) % options.length
                    : selected < 0 ? options.length - 1 : (selected - 1 + options.length) % options.length)
            }
        } else if (event.key === 'Enter' && isOpen && selected >= 0) {
            event.preventDefault()
            choose(selected)
        }
    }

    /** The original field wrapper: input + toggle button, with the combobox semantics. */
    const field = (key: SuggestionField, input: {
        value: string
        placeholder: string
        disabled?: boolean
        onChange: (value: string) => void
    }): ReactNode => (
        <span className={`suggestion-input${active === key ? ' suggestion-open' : ''}`}>
            <input
                id={`ta-${key}`}
                ref={(element) => { inputs.current[key] = element }}
                autoComplete="off"
                placeholder={input.placeholder}
                maxLength={90}
                value={input.value}
                disabled={input.disabled}
                role="combobox"
                aria-label={`${spaced(key).replace(/^./, (char) => char.toUpperCase())} *`}
                aria-required="true"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-controls={LIST_ID}
                aria-expanded={active === key}
                aria-activedescendant={active === key && selected >= 0 ? `${LIST_ID}-${selected}` : undefined}
                onFocus={() => open(key)}
                onClick={() => { if (active !== key) open(key) }}
                onChange={(event) => {
                    input.onChange(event.currentTarget.value)
                    open(key, 180)
                }}
                onBlur={() => { if (latest.current.active === key) close() }}
                onKeyDown={onKeyDown(key)}
            />
            <button
                type="button"
                tabIndex={-1}
                className="suggestion-toggle"
                aria-label={`Show ${CONFIG[key][0].toLowerCase()} for ${spaced(key).toLowerCase()}`}
                aria-controls={LIST_ID}
                disabled={input.disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                    if (active === key) close()
                    else {
                        inputs.current[key]?.focus({ preventScroll: true })
                        open(key)
                    }
                }}
            >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </button>
        </span>
    )

    const panel: ReactNode = (
        <div ref={popup} className="suggestion-panel" hidden={!active}>
            <div className="suggestion-heading">
                <strong>{active ? CONFIG[active][0] : ''}</strong>
                <span>{status === null && options.length ? `${options.length} ${options.length === 1 ? 'match' : 'matches'}` : ''}</span>
            </div>
            <div ref={list} id={LIST_ID} className="suggestion-list" role="listbox" aria-label={active ? CONFIG[active][0] : undefined}>
                {status === null && options.map((option, index) => (
                    <div
                        key={`${option.value}-${index}`}
                        id={`${LIST_ID}-${index}`}
                        className="suggestion-option"
                        role="option"
                        aria-selected={index === selected}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => choose(index)}
                        onPointerMove={() => { if (selected !== index) setSelected(index) }}
                    >
                        <span className="suggestion-folder" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M3 6h6l2 3h10v11H3z" /><path d="M3 10h18" /></svg>
                        </span>
                        <span className="suggestion-text"><strong>{option.value}</strong><small>{option.detail}</small></span>
                        <span className="suggestion-select" aria-hidden="true">↵</span>
                    </div>
                ))}
            </div>
            <div className="suggestion-status" role="status" hidden={status === null}>{status}</div>
            <div className="suggestion-footer" hidden={status !== null}>↑ ↓ Navigate · Enter Select · Esc Close</div>
        </div>
    )

    return { field, panel, fields: FIELDS, input: (key: SuggestionField) => inputs.current[key] ?? null }
}
