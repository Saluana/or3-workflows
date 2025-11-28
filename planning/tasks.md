# tasks.md

## 1. Package Setup
- [ ] Initialize `or3-workflow` package structure (package.json, tsconfig.json).
- [ ] Install `@openrouter/sdk` as dev dependency.
- [ ] Set up Vitest for unit testing.

## 2. Core Types & Builder
- [ ] Define interfaces: `StepConfig`, `WorkflowDefinition`, `RunInput`, `WorkflowResult`. (Req §1.1)
- [ ] Implement `WorkflowBuilder` class with `.step()`, `.parallel()`, and `.toJSON()` methods. (Req §1.2, §1.3, §5.1)
- [ ] Implement `workflow(client)` factory function. (Req §1.1)
- [ ] Implement `WorkflowBuilder.fromJSON()` deserialization. (Req §5.2)

## 3. Execution Engine (Sequential)
- [ ] Implement `Executor` class skeleton.
- [ ] Implement context management: initialize with history + input. (Req §2.4)
- [ ] Implement sequential step execution: call OpenRouter, append output to history. (Req §2.1)
- [ ] Implement `.run()` method returning `WorkflowResult`. (Req §1.4)

## 4. Parallel Execution & Merging
- [ ] Implement `Executor` logic for parallel steps (Promise.all). (Req §2.2)
- [ ] Implement auto-merge logic: format parallel outputs into a single synthetic message. (Req §2.3)
- [ ] Add unit tests for complex chains (Seq -> Par -> Seq).

## 5. Tool Support
- [ ] Add tool definition types to `StepConfig`. (Req §3.1)
- [ ] Implement tool detection in Executor loop.
- [ ] Implement auto-execution logic (calling `tool.handler`). (Req §3.2)
- [ ] Implement manual execution callback (`onToolCall`). (Req §3.3)
- [ ] Add recursion loop for tool results (Model -> Tool -> Model).

## 6. Multimodal Support
- [ ] Add `attachments` support to `RunInput`. (Req §4.1)
- [ ] Implement message formatting for attachments (OpenRouter content parts). (Req §4.2)
- [ ] Implement capability check: validate model against attachment types. (Req §4.3)

## 7. Streaming
- [ ] Implement `.stream()` generator method. (Req §1.5)
- [ ] Emit `step:start`, `chunk`, `tool:call`, `step:done` events.
- [ ] Ensure streaming works with parallel steps (interleaved chunks or buffered).

## 8. Testing & Polish
- [ ] Write end-to-end tests with mocked OpenRouter client.
- [ ] Verify bundle size is minimal.
- [ ] Add TSDoc comments for all public APIs.
