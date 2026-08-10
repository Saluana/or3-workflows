# OpenRouter live workflow tests

The live suite executes real workflows against OpenRouter. It covers every
standard executable node type (`start`, `agent`, `router`, `parallel`,
`whileLoop`, `subflow`, and `output`) plus structured and research-agent
configurations.

It is disabled during normal test runs. Enable it explicitly:

```sh
OPENROUTER_API_KEY=... RUN_OPENROUTER_LIVE=1 bun run test:live:openrouter
```

All model-backed nodes default to `openai/gpt-5.6-luna`. Set
`OPENROUTER_LIVE_MODEL` to exercise a specific model revision. Assertions test
observable contracts (selected routes, JSON schemas, iteration counts, mapped
subflow input, branch execution, and output formatting) instead of exact prose.
The runner prints duration, model-call count, and provider-reported cost for
each scenario when available.

The cache probe runs a four-agent dataflow twice with an identical static
prefix and stable session ID. The first run warms the provider cache; the
second asserts that OpenRouter reports cached input tokens. This also verifies
that workflow execution forwards the session ID for sticky provider routing
and prompt-cache routing.

The complex suite additionally exercises router-to-parallel-to-structured
pipelines, nested subflows with scoped telemetry, and concurrent DAG fan-in to
an AI synthesis output. It also runs a real model-driven local tool loop and
verifies that the tool result reaches downstream output. Invalid schema routing
and human-review output replacement cover recovery and approval paths.

Because these are network tests, provider availability, model capability
routing, and server-tool support can cause failures that do not occur in the
offline unit suite. Such failures are intentional diagnostics rather than
reasons to weaken the assertions.

## Long-form book stress tests

The separate long-form suite writes two complete four-chapter nonfiction
manuscripts and one three-chapter short novel. Each nonfiction chapter passes
through Writer, Proofreader, and Reviser agents. The researched workflow
additionally searches and reads the web before every chapter, and its
assertions require source URLs to survive revision.

For fiction, two writers draft every chapter concurrently with distinct
psychological-dread and cinematic-suspense craft briefs. A judge scores both,
chooses one draft verbatim, and a continuity editor then receives the outline
plus every accepted chapter to produce exactly eight compact numbered beats for
the next chapter. The next writers and judge receive those beats alongside the
complete accepted history. The test verifies winner metadata and exact draft
equality so a judge cannot silently merge or rewrite the candidates. Word counts
are reported for observability, but are deliberately not a pass/fail
requirement because models cannot measure their own output reliably.

```sh
OPENROUTER_API_KEY=... RUN_OPENROUTER_LONGFORM=1 \
  bun run test:live:openrouter:longform
```

This suite can run for many minutes and generate substantial output, so it is
not included in the ordinary live matrix.
