import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './premium.css'
import './flash.css'
import { installPaperGrain } from '@/components/flash/paperGrain.ts'
import App from './App.tsx'

installPaperGrain()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
