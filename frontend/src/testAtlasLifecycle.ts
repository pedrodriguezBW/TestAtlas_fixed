const SESSION_KEY = 'testatlas-browser-session'
const HEARTBEAT_INTERVAL_MS = 2000

function createSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY)

  if (existing) {
    return existing
  }

  const created = createSessionId()
  sessionStorage.setItem(SESSION_KEY, created)

  return created
}

export function startTestAtlasLifecycle(): void {
  const sessionId = getSessionId()

  const heartbeat = async (): Promise<void> => {
    try {
      await fetch('/api/lifecycle/heartbeat', {
        method: 'POST',
        body: sessionId,
        headers: {
          'Content-Type': 'text/plain',
        },
        cache: 'no-store',
        keepalive: true,
      })
    } catch {
      // Un fallo temporal no debe cerrar TestAtlas.
    }
  }

  const notifyClose = (): void => {
    navigator.sendBeacon(
      '/api/lifecycle/close',
      new Blob([sessionId], {
        type: 'text/plain',
      }),
    )
  }

  void heartbeat()

  window.setInterval(
    () => void heartbeat(),
    HEARTBEAT_INTERVAL_MS,
  )

  window.addEventListener('pagehide', notifyClose)
}