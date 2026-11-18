import { useEffect, useRef, type CSSProperties } from 'react'
import { factsFor, palette, sceneFor, stepCopy, summaryFor, vibrationCopy, type VisualState } from './visuals'

// The illustrated companion of the original Test Atlas (public/visuals.js):
// decorative SVG scene, copy and facts for the current step, and a light
// rotating particle field drawn on a canvas. No test telemetry is simulated.

const POINTS = Array.from({ length: 100 }, (_, i) => {
    const azimuth = i * 2.399963
    const z = 1 - (2 * i + 1) / 100
    const r = Math.sqrt(1 - z * z)
    return [r * Math.cos(azimuth), z, r * Math.sin(azimuth)] as const
})

export function VisualWorkspace({ state, paused, onToggleMotion }: {
    state: VisualState
    paused: boolean
    onToggleMotion: () => void
}) {
    const panelRef = useRef<HTMLElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const sceneRef = useRef<HTMLDivElement | null>(null)
    const pausedRef = useRef(paused)
    const restart = useRef<() => void>(() => undefined)
    const [eyebrow, title, footer] = (state.testType === 'vibration' ? vibrationCopy : stepCopy)[state.step]
    const index = state.step === 6 ? '✓' : String(state.step + 1).padStart(2, '0')

    useEffect(() => {
        const panel = panelRef.current
        const canvas = canvasRef.current
        const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
        if (!panel || !canvas || !context) return undefined
        let visible = true
        let frame = 0
        let width = 1
        let height = 1
        let elapsed = 0
        let lastTime = 0
        let pointer = { x: 0, y: 0 }

        const running = () => !pausedRef.current && visible && !document.hidden
        const draw = (now: number) => {
            frame = 0
            if (lastTime && running()) elapsed += Math.min(now - lastTime, 40)
            lastTime = now
            context.clearRect(0, 0, width, height)
            const angle = elapsed * 0.00009 + pointer.x * 0.14
            const radius = Math.min(width, height) * 0.46
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            for (let i = 0; i < POINTS.length; i++) {
                const [x, y, z] = POINTS[i]
                const px = x * cos - z * sin
                const depth = x * sin + z * cos
                const scale = 1 + depth * 0.17
                const sx = width / 2 + px * radius * 1.43 * scale
                const sy = height / 2 + (y + pointer.y * 0.1) * radius * 0.87 * scale
                context.fillStyle = `rgba(176,202,235,${0.07 + (depth + 1) * 0.1})`
                context.fillRect(sx, sy, depth > 0.5 ? 2 : 1, depth > 0.5 ? 2 : 1)
                if (i % 10 === 0) {
                    context.beginPath()
                    context.moveTo(sx - 4, sy)
                    context.lineTo(sx + 4, sy)
                    context.moveTo(sx, sy - 4)
                    context.lineTo(sx, sy + 4)
                    context.strokeStyle = 'rgba(217,169,40,.2)'
                    context.lineWidth = 0.5
                    context.stroke()
                }
            }
            if (running()) frame = requestAnimationFrame(draw)
        }
        const update = () => {
            if (frame) cancelAnimationFrame(frame)
            frame = 0
            lastTime = 0
            draw(performance.now())
        }
        restart.current = update
        const resize = () => {
            const bounds = canvas.getBoundingClientRect()
            width = bounds.width
            height = bounds.height
            const ratio = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.round(width * ratio)
            canvas.height = Math.round(height * ratio)
            context.setTransform(ratio, 0, 0, ratio, 0, 0)
            if (!frame) draw(performance.now())
        }
        const move = (event: PointerEvent) => {
            if (pausedRef.current || event.pointerType === 'touch') return
            const rect = panel.getBoundingClientRect()
            pointer = { x: (event.clientX - rect.left) / rect.width - 0.5, y: (event.clientY - rect.top) / rect.height - 0.5 }
            sceneRef.current?.style.setProperty('--art-y', `${pointer.x * 8}deg`)
            sceneRef.current?.style.setProperty('--art-x', `${-pointer.y * 6}deg`)
        }
        const leave = () => {
            pointer = { x: 0, y: 0 }
            sceneRef.current?.style.setProperty('--art-y', '0deg')
            sceneRef.current?.style.setProperty('--art-x', '0deg')
        }
        const intersection = typeof IntersectionObserver === 'function'
            ? new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; update() })
            : null
        intersection?.observe(panel)
        const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
        resizer?.observe(canvas)
        document.addEventListener('visibilitychange', update)
        panel.addEventListener('pointermove', move)
        panel.addEventListener('pointerleave', leave)
        resize()
        update()
        return () => {
            if (frame) cancelAnimationFrame(frame)
            intersection?.disconnect()
            resizer?.disconnect()
            document.removeEventListener('visibilitychange', update)
            panel.removeEventListener('pointermove', move)
            panel.removeEventListener('pointerleave', leave)
            restart.current = () => undefined
        }
    }, [])

    useEffect(() => {
        pausedRef.current = paused
        restart.current()
    }, [paused])

    return (
        <aside
            ref={panelRef}
            className="visual-workspace"
            aria-label="Test organization overview"
            style={{ '--scene-accent': palette[state.step] } as CSSProperties}
        >
            <div className="visual-topline">
                <span>ATLAS / <span id="ta-visualIndex">{index}</span></span>
                <button
                    id="ta-motionToggle"
                    type="button"
                    aria-pressed={paused}
                    aria-label={paused ? 'Resume decorative animations' : 'Pause decorative animations'}
                    onClick={onToggleMotion}
                >
                    {paused ? '▷ ' : 'Ⅱ '}<span>{paused ? 'Resume motion' : 'Pause motion'}</span>
                </button>
            </div>
            <div className="visual-art" aria-hidden="true">
                <canvas id="ta-atlasCanvas" ref={canvasRef} />
                <div
                    id="ta-atlasScene"
                    key={state.step}
                    ref={sceneRef}
                    className="scene-enter"
                    dangerouslySetInnerHTML={{ __html: sceneFor(state) }}
                />
                <span className="art-cross cross-a">+</span>
                <span className="art-cross cross-b">+</span>
                <span className="art-coordinate">AUTOMOTIVE / FILE SYSTEM</span>
            </div>
            <div className="visual-story">
                <span className="visual-eyebrow" id="ta-visualEyebrow">{`${index} / ${eyebrow}`}</span>
                <h2 id="ta-visualTitle" dangerouslySetInnerHTML={{ __html: title }} />
                <p id="ta-visualDescription">{summaryFor(state)}</p>
            </div>
            <div id="ta-visualFacts" className="visual-facts" dangerouslySetInnerHTML={{ __html: factsFor(state) }} />
            <div className="visual-footer">
                <span id="ta-visualStatus">{footer}</span>
                <span className="visual-arrow" aria-hidden="true">↗</span>
            </div>
        </aside>
    )
}
