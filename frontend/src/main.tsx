import { startTestAtlasLifecycle } from './testAtlasLifecycle'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TestAtlasView from './view/TestAtlasView.tsx'
import '@mantine/core/styles.css'
import './index.css'
import { MantineProvider } from '@mantine/core'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <TestAtlasView />
    </MantineProvider>
  </StrictMode>,
)

startTestAtlasLifecycle()
