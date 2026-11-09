// @vitest-environment jsdom
import { StrictMode } from 'react'
import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { version } from '../../package.json'
import TestAtlasView from './TestAtlasView'

function renderApp() {
  return render(<StrictMode><MantineProvider env="test"><TestAtlasView /></MantineProvider></StrictMode>)
}

describe('standalone Test Atlas view', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    fetchMock = vi.fn(async (input: string) => {
      if (String(input) === '/api/scripts/versions') return new Response('{"TEST_ATLAS":"1.0"}')
      return new Response('{"programs":[],"phases":[],"tests":[],"batches":[]}')
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens Test Atlas directly, without the Toolbox catalogue', async () => {
    const { container } = renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Test Atlas' })).toBeTruthy()
    expect(screen.getByText('What kind of test are you organizing?')).toBeTruthy()
    expect(screen.queryByText('Available tools')).toBeNull()
    expect(container.querySelector('.test-atlas-host')).not.toBeNull()
    await waitFor(() => expect(screen.getByText(`v${version} · algorithm 1.0`)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/scripts/versions', expect.anything())
  })

  it('keeps the Toolbox execution controls the form relies on, without the generic frame', () => {
    renderApp()

    const atlasFrame = document.querySelector('.test-atlas-host')?.parentElement
    expect(atlasFrame?.classList.contains('execution-form--test-atlas')).toBe(true)
    expect(atlasFrame?.hasAttribute('data-with-border')).toBe(false)
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    expect(screen.getByText('Check the input')).toBeTruthy()
  })

  it('shows an unavailable algorithm version without blocking the tool', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 503 }))
    renderApp()

    await waitFor(() => expect(screen.getByText(`v${version} · algorithm -`)).toBeTruthy())
    expect(screen.getByText('What kind of test are you organizing?')).toBeTruthy()
  })
})
