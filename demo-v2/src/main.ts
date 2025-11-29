import { createApp } from 'vue'
import App from './App.vue'

// Import Vue Flow CSS
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

// Import our CSS variables  
import '../../packages/workflow-vue/src/styles/variables.css'
import './style.css'

createApp(App).mount('#app')
