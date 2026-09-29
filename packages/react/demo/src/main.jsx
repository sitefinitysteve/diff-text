import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Library stylesheet first (aliased to @diff-text/core's canonical style.css), then the shared demo theme (demo/README.md).
import 'react-diff-text/dist/style.css'
import './demo.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
