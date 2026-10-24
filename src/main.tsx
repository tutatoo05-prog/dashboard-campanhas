import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// fontes servidas por nós (nada de Google Fonts: bloqueio de rede ou de extensão deixava o painel sem tipografia)
import '@fontsource/bebas-neue/400.css'
import '@fontsource/pirata-one/400.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/400-italic.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import './style.css'
import './premium.css'
import './flash.css'
import './actions.css'
import './dark.css'
import './mobile.css'
import './leads.css'
import './topnav.css'
import '@/store/themeStore.ts'
import { installPaperGrain } from '@/components/flash/paperGrain.ts'
import App from './App.tsx'

installPaperGrain()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
