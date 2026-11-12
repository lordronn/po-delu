import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getBrowserStorage } from './data/storage'
import { createTaskStore } from './app/task-store'

const backend = getBrowserStorage()
const store = createTaskStore(backend)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} backend={backend} />
  </StrictMode>,
)
