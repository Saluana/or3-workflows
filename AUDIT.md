# or3-workflows Audit — July 2026

Full audit of the monorepo by parallel agents covering `workflow-core`, `workflow-vue`, demos, dependencies, and modernization against the 2025–2026 AI agent stack (Vercel AI SDK, LangGraph/Mastra patterns, MCP, OpenTelemetry).

**Verdict:** Strong TipTap-style foundation with real breadth (HITL, compaction, parallel, subflows), but several correctness bugs in concurrent execution / tool protocol, outdated deps, zero CI, and large UX gaps vs modern builders (n8n, Dify, Langflow). Highest ROI is fixing data-flow races + tool protocol, then deps/CI, then an AI-SDK provider adapter.

---

## Critical bugs (engine)

| ID | Issue | Status in this PR |
|----|-------|-------------------|
| C1 | Shared mutable `context.currentInput` races under DAG `Promise.all` waves — diamond/parallel graphs get wrong inputs | **Fixed:** per-parent `resolveNodeInput()` |
| C2 | Concurrent agent nodes interleaved `session.addMessage` | **Fixed:** deferred session appends in wave order |
| C3 | Tool loop used `role:'system'` fake results instead of `role:'tool'` + `tool_call_id` / `tool_calls` on assistant | **Fixed** in Agent + Parallel extensions |
| C4 | `WorkflowEdgeSchema` stripped `type`/`selected` on load/save | **Fixed** |
| C5 | Output `{{nodeId}}` regex `\w+` never matched UUID node IDs | **Fixed** (`[\w.:-]+`) |
| C6 | `stop()` nulled AbortController so loop guards stopped seeing abort | **Fixed:** keep aborted controller until next execute |

## High-priority follow-ups

- **H1–H3:** Forward `AbortSignal` to Router/WhileLoop/Parallel/compaction; inherit into subflows; abort timed-out parallel branches — **Done**
- **H4:** Request real token usage (`stream_options.include_usage`) instead of char estimates — Open
- **H5–H6:** Schema drift remaining around `StrictNodeDataSchema` (`_nodeType` discriminator unused) — Open
- **H7:** Durable checkpoint/resume + HITLAdapter wiring — **Done** (`CheckpointAdapter`, `durableHITL`)
- **H8:** Provider reaches into OpenRouter SDK private `_options` fields — Open

## UI / UX (demo-v2 + workflow-vue)

| ID | Issue | Status |
|----|-------|--------|
| U1 | No Stop control during runs (spinner-only send) | **Fixed:** Stop button wired to `stop()` |
| U2 | Module-global `useExecutionCache` shared across editors | **Fixed:** provide/inject + `createExecutionCache()` |
| U3 | Missing CSS tokens `--or3-color-surface-card` / `--or3-color-bg-hover` broke light theme | **Fixed** |
| U4 | Delete workflow had no confirm | **Fixed** |
| U5 | 13 debug `console.log`s in branch streaming | **Removed** |
| U6 | Modals lack dialog a11y / Escape / focus trap | Open |
| U7 | `NodeInspector.vue` ~3.7k lines; demo `ChatPanel` diverged from library | Open |
| U8 | No markdown rendering in chat; no minimap in demo; no command palette | Open |
| U9 | Deep autosave watchers on full graph + dead scoped CSS in `App.vue` (~650 lines) | Open |

## Dependencies

| Package | Issue | Action |
|---------|-------|--------|
| `@openrouter/sdk` | demos on `0.1` vs core `0.3` → Zod 3/4 split | **Unified to `^0.3.11`** |
| `vitest` | was `1.x` | **Upgraded to `^4.1.10`** |
| `vite` | was 5/7 mix | **Upgraded to `^8.1.5`** |
| `@vueuse/core` | was `10` | **Upgraded to `^14`** |
| `vite-plugin-dts` / `@vitejs/plugin-vue` | majors behind | **Upgraded to 5 / 6** |
| Repo URL | packages pointed at `github.com/or3/...` | **Fixed → Saluana** |
| Docs imports | `@or3/workflow-*` vs published `or3-workflow-*` | **Fixed** in EXTENSIONS/ADAPTERS/examples |
| Tooling | No ESLint, Prettier, CI, changesets, Playwright | **CI added**; rest open |

## Modernization roadmap

### Done
1. Critical engine correctness (C1–C6)
2. Unify OpenRouter SDK + docs package names + repo URL
3. Stop button + theme tokens + delete confirm + drop debug logs
4. GitHub Actions CI
5. Vitest 4 + Vite 8 + VueUse 14
6. AbortSignal everywhere (Router/WhileLoop/Parallel/compaction/subflows/timeouts)
7. `CheckpointAdapter` + `durableHITL` suspend/resume
8. `McpToolAdapter` / `mcpToolsToExecutable`

### Still open
9. **`AiSdkLLMProvider`** (Vercel AI SDK) → multi-provider
10. Zod-typed tools + structured output node
11. OpenTelemetry / Langfuse
12. Changesets + size-limit; ESLint/Prettier
13. Accessible modals; promote demo ChatPanel; split NodeInspector
14. Editor↔execution extension bridge; complete Tool node

## Top remaining by ROI

1. AI SDK provider adapter (biggest capability unlock)
2. Accessible modal primitive + aria-live streaming
3. Promote demo ChatPanel into the library
4. Break up NodeInspector; schema-driven forms
5. ESLint + Prettier + no-`any` on tool types
6. Real usage tokens + optional tokenizer for compaction

## Test coverage

- Tool protocol assertion — added
- Durable HITL pause/resume + MCP adapter — added (`checkpoint-mcp.test.ts`)
- Still open: diamond DAG determinism, WhileLoop/Parallel/Subflow execution, cancel-aborts-HTTP, edge round-trip

---

*July 2026 audit. Follow-up commits on this PR implement abort propagation, Vitest/Vite upgrades, durable HITL checkpointing, and MCP tool import.*
