import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Container,
  Divider,
  Group,
  List,
  LoadingOverlay,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
  Button,
} from '@mantine/core'
import testAtlas from '../algorithms/impl/TestAtlas.algorithm'
import { useAlgorithmVersions } from '../algorithms/useAlgorithmVersions'
import type { AlgorithmStrategy, Progress as ProgressType } from '../algorithms/types'
import { version } from '../../package.json'

/**
 * Standalone host of the Test Atlas strategy. It keeps the execution view the
 * tool had inside the Engineering Toolbox (form without the generic frame, the
 * validation list, the Run button the form presses on "Confirm & save files",
 * progress, error and result panels) without the Toolbox catalogue.
 */
export function ExecutionView({ algorithm }: { algorithm: AlgorithmStrategy }) {
  const [config, setConfig] = useState<any>(() => algorithm.emptyConfig())
  const [result, setResult] = useState<any>(null)
  const [resultConfig, setResultConfig] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressType | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const errors: string[] = algorithm.validate?.(config) ?? []
  const { InputForm, OutputView } = algorithm

  useEffect(() => {
    if (running) {
      progressRef.current?.scrollIntoView?.({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'center',
      })
    }
  }, [running])

  useEffect(() => {
    if (result !== null && resultConfig !== null) {
      resultRef.current?.scrollIntoView?.({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'end',
      })
    }
  }, [result, resultConfig])

  const run = async () => {
    const controller = new AbortController()
    const submittedConfig = structuredClone(config)
    abortRef.current = controller
    setRunning(true)
    setError(null)
    setResult(null)
    setResultConfig(null)
    setProgress(null)
    try {
      const nextResult = await algorithm.execute(submittedConfig, {
        onProgress: setProgress,
        signal: controller.signal,
      })
      setResultConfig(submittedConfig)
      setResult(nextResult)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  return (
    <Stack gap="lg">
      <Paper
        className="execution-form execution-form--test-atlas"
        withBorder={false}
        p={0}
        pos="relative"
      >
        <LoadingOverlay visible={running} zIndex={10} overlayProps={{ blur: 1 }} />
        <InputForm value={config} onChange={setConfig} disabled={running} />
      </Paper>

      {errors.length > 0 && (
        <Alert color="yellow" title="Check the input" variant="light">
          <List size="sm">
            {errors.map((message) => <List.Item key={message}>{message}</List.Item>)}
          </List>
        </Alert>
      )}

      <Group>
        <Button onClick={() => { void run() }} loading={running} disabled={errors.length > 0}>
          Run
        </Button>
        {running && (
          <Button variant="subtle" color="red" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        )}
      </Group>

      {(running || progress) && (
        <Stack ref={progressRef} gap={4} role="region" aria-label="Algorithm progress">
          {progress ? (
            <>
              <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} animated />
              <Text size="sm" c="dimmed">
                {progress.current} / {progress.total}
                {progress.message ? ` - ${progress.message}` : ''}
              </Text>
            </>
          ) : <Progress value={100} animated striped />}
        </Stack>
      )}

      {error !== null && (
        <Alert color="red" title="Run failed" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {result !== null && resultConfig !== null && (
        <Stack ref={resultRef} gap="sm" role="region" aria-label="Algorithm result">
          <Divider />
          <Title order={2} size="h3">Result</Title>
          <Paper withBorder p="md">
            <OutputView result={result} config={resultConfig} />
          </Paper>
        </Stack>
      )}
    </Stack>
  )
}

const TestAtlasView = () => {
  const { versions, loading, error } = useAlgorithmVersions()
  const algorithmVersion = loading ? '...' : error ? '-' : versions[testAtlas.id] ?? '-'

  return (
    <div className="app-shell">
      <header className="app-header">
        <Text className="brand-name" component="h1">{testAtlas.label}</Text>
        <div className="header-tools">
          <img className="bw-logo" src="/BorgWarner_Logo_White.svg" alt="BorgWarner" />
          <Text className="app-version" title="Interface version / backend algorithm version">
            {`v${version} · algorithm ${algorithmVersion}`}
          </Text>
        </div>
      </header>
      <main>
        <Container size={1440} py={{ base: 'md', sm: 32 }}>
          <Stack gap="lg">
            <div className="execution-heading">
              <Text c="dimmed">{testAtlas.description}</Text>
            </div>
            <ExecutionView algorithm={testAtlas} />
          </Stack>
        </Container>
      </main>
    </div>
  )
}

export default TestAtlasView
