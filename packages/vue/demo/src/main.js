// Library stylesheet first (the canonical copy in @diff-text/core, which the build ships as
// dist/style.css), then the shared demo theme (demo/README.md).
import '@diff-text/core/style.css'
import './demo.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
