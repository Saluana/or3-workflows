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

## High-priority follow-ups (not all fixed here)

- **H1–H3:** Forward `AbortSignal` to Router/WhileLoop/Parallel/compaction; inherit into subflows; abort timed-out parallel branches
- **H4:** Request real token usage (`stream_options.include_usage`) instead of char estimates
- **H5–H6:** Schema drift remaining around `StrictNodeDataSchema` (`_nodeType` discriminator unused)
- **H7:** HITL is in-process blocking only — `HITLAdapter` never wired; no durable checkpoint/resume
- **H8:** Provider reaches into OpenRouter SDK private `_options` fields

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
| `vitest` | `1.x` (3 majors behind; pins Vite 5) | Upgrade to 4 (follow-up) |
| `vite` | demo-v2 on 5, packages on 7; latest is 8 | Unify (follow-up) |
| `@vueuse/core` | `10` vs latest `14` | Upgrade (follow-up) |
| `vue-tsc` / `vite-plugin-dts` | 1 major behind | Upgrade (follow-up) |
| Repo URL | packages pointed at `github.com/or3/...` | **Fixed → Saluana** |
| Docs imports | `@or3/workflow-*` vs published `or3-workflow-*` | **Fixed** in EXTENSIONS/ADAPTERS/examples |
| Tooling | No ESLint, Prettier, CI, changesets, Playwright | **CI added**; rest open |

## Modernization roadmap

### Quick wins (done or nearly free)
1. Critical engine correctness (C1–C6) — **done this PR**
2. Unify OpenRouter SDK + docs package names + repo URL — **done**
3. Stop button + theme tokens + delete confirm + drop debug logs — **done**
4. GitHub Actions CI — **done**
5. Upgrade Vitest 4 + Vite 8 + VueUse 14 together

### Medium (additive on existing seams)
6. **`AiSdkLLMProvider`** wrapping Vercel AI SDK `streamText` → multi-provider (OpenAI/Anthropic/Google/Groq/Ollama) without rewriting the DAG engine
7. Zod-typed tools + structured output node (`generateObject`)
8. OpenTelemetry / Langfuse around existing `onNode*` / `onTokenUsage` callbacks
9. Changesets + release workflow; size-limit budget for core

### Strategic
10. **`McpToolAdapter`** → register MCP server tools into `toolRegistry`
11. **`CheckpointAdapter`** for durable HITL suspend/resume (LangGraph-style interrupt)
12. Finish editor↔execution extension bridge; complete Tool node; decide fate of original fluent builder / `.stream()` generator in `planning/`

## Top 10 remaining by ROI

1. AbortSignal everywhere + subflow/timeout cancellation
2. Vitest 4 + Vite 8 upgrade (kills duplicate Vite)
3. AI SDK provider adapter (biggest capability unlock)
4. Accessible modal primitive + aria-live streaming
5. Promote demo ChatPanel into the library; delete orphaned one
6. Break up NodeInspector; schema-driven forms
7. Durable checkpointing / HITLAdapter wiring
8. MCP tool adapter
9. ESLint + Prettier + no-`any` on tool types
10. Real usage tokens + optional tokenizer for compaction

## Test coverage gaps (still open)

- Diamond/parallel DAG determinism tests
- WhileLoop / Parallel / Subflow *execution* tests
- Cancellation aborts in-flight HTTP
- Edge `type`/`selected` round-trip
- Tool protocol assertion — **added** in agent-tool-iterations test

---

*This document captures the July 2026 audit. Implementation in the accompanying PR addresses the critical correctness bugs and highest-ROI quick wins; remaining items are intentional follow-ups.*
