# Installation

## Requirements

-   Node.js 18+ or Bun 1.0+
-   Vue 3.4+ (for Vue components)
-   TypeScript 5.0+ (recommended)

## Package Manager

We recommend using [Bun](https://bun.sh) for faster installation:

```bash
# Using bun (recommended)
bun add or3-workflow-core or3-workflow-vue

# Using npm
npm install or3-workflow-core or3-workflow-vue

# Using pnpm
pnpm add or3-workflow-core or3-workflow-vue

# Using yarn
yarn add or3-workflow-core or3-workflow-vue
```

## Core Only

If you're building your own UI or using a different framework, you only need the core package:

```bash
bun add or3-workflow-core
```

## Peer Dependencies

The Vue package has the following peer dependencies:

```json
{
    "peerDependencies": {
        "vue": "^3.4.0"
    }
}
```

Install it if not already present:

```bash
bun add vue
```

The other dependencies (`@vue-flow/core`, `at-vueuse/core`, etc.) are automatically installed as dependencies of `or3-workflow-vue`.

## TypeScript Configuration

For full type support, ensure your `tsconfig.json` includes:

```json
{
    "compilerOptions": {
        "strict": true,
        "moduleResolution": "bundler",
        "esModuleInterop": true
    }
}
```

## OpenRouter API Key

To execute workflows, you'll need an [OpenRouter](https://openrouter.ai) API key:

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Generate an API key
3. Store it securely (never commit to git)

```typescript
// Use environment variable
const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
```

## CSS Import

Import the styles in your main entry file:

```typescript
// main.ts
import 'or3-workflow-vue/style.css';
```

Or in your CSS:

```css
@import 'or3-workflow-vue/style.css';
```

## Verify Installation

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';

const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

console.log('Editor created:', editor.nodes.length);
```

## Next Steps

-   [Quick Start](./quick-start.md) - Build your first workflow
-   [WorkflowEditor](./api/workflow-editor.md) - Core API reference
