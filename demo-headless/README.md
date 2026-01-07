# demo-headless

Headless demo runner for **or3-workflow-core** workflows.

This workspace provides a Bun-based CLI that loads a workflow from a JSON or TypeScript file and executes it using the `OpenRouterExecutionAdapter`.

## Setup

1. Ensure dependencies are installed at the monorepo root:

   ```bash
   pnpm install
   ```

2. Add your OpenRouter API key to the root `.env` file:

   ```bash
   echo 'OPENROUTER_API_KEY=sk-or-...' >> .env
   ```

   Bun will expose this as `Bun.env.OPENROUTER_API_KEY`.

## Usage

From the monorepo root, run:

```bash
bun run --filter demo-headless run -- ./demo-headless/example-workflow.json "Say hello in one sentence."
```

You can also use the TypeScript example:

```bash
bun run --filter demo-headless run -- ./demo-headless/example-workflow.ts "Explain what this workflow does."
```

If you omit the input text argument, the runner will read input from STDIN:

```bash
echo "Summarize this input." | bun run --filter demo-headless run -- ./demo-headless/example-workflow.json
```

For help:

```bash
bun demo-headless/src/index.ts --help
```

## Prebuilt workflows (8 niche cases)

All paths below are relative to `demo-headless/` when using `--filter demo-headless`:

- `./workflows/support-triage-router.json` — routes to bug/feature/billing intake lanes.
- `./workflows/tone-refiner-loop.json` — while-loop polisher for concise, friendly copy.
- `./workflows/parallel-briefing.json` — parallel exec summary, risks, and actions, then merge.
- `./workflows/bug-brief-generator.json` — structured bug brief with repro steps.
- `./workflows/meeting-notes-to-actions.json` — turns meeting notes into decisions/risks/actions.
- `./workflows/research-plan-checker.json` — drafts a research plan and audits it.
- `./workflows/data-quality-audit.json` — data-quality checklist + probe queries.
- `./workflows/risk-register-builder.json` — parallel risks/mitigations merged into a register.

Example run (from repo root):

```bash
bun run --filter demo-headless run -- ./workflows/parallel-briefing.json "Context about a launch status for the briefing."
```
