/**
 * Evaluation harness and assertion DSL (R8.AC5, R8.AC6).
 *
 * Cases are stored outside production run state. Mocked cases run in CI without
 * network access; live cases require an explicit environment flag and never run
 * in ordinary unit tests. The harness is transport-agnostic: the host supplies a
 * `runner` that executes a case and returns a normalized output.
 */
import type { ExecutionInput, WorkflowData } from '../types';

/** Normalized output the harness asserts against. */
export interface EvaluationRunOutput {
    output: string;
    costUsd?: number;
    durationMs: number;
    /** Optional structured value for property assertions. */
    value?: unknown;
}

/** Declarative assertion over a run output. */
export type EvaluationAssertion =
    | { kind: 'output-contains'; value: string }
    | { kind: 'output-equals'; value: string }
    | { kind: 'output-matches'; pattern: string; flags?: string }
    | { kind: 'max-cost-usd'; value: number }
    | { kind: 'max-duration-ms'; value: number }
    | {
          kind: 'custom';
          name: string;
          predicate: (output: EvaluationRunOutput) => boolean;
      };

export interface EvaluationCase {
    id: string;
    workflowFixture: WorkflowData;
    input: ExecutionInput;
    providerMode: 'mock' | 'live';
    assertions: EvaluationAssertion[];
    limits?: { maxCostUsd?: number; maxDurationMs?: number };
    /** Optional candidate identifier (model/routing/backend) for comparisons. */
    candidateId?: string;
}

export interface AssertionResult {
    assertion: EvaluationAssertion;
    passed: boolean;
    detail?: string;
}

export interface EvaluationResult {
    caseId: string;
    candidateId?: string;
    skipped: boolean;
    passed: boolean;
    output?: EvaluationRunOutput;
    assertions: AssertionResult[];
    error?: string;
}

/** Executes one case and returns a normalized output. */
export type EvaluationRunner = (
    testCase: EvaluationCase
) => Promise<EvaluationRunOutput>;

function evaluateAssertion(
    assertion: EvaluationAssertion,
    output: EvaluationRunOutput
): AssertionResult {
    switch (assertion.kind) {
        case 'output-contains':
            return {
                assertion,
                passed: output.output.includes(assertion.value),
            };
        case 'output-equals':
            return { assertion, passed: output.output === assertion.value };
        case 'output-matches':
            return {
                assertion,
                passed: new RegExp(assertion.pattern, assertion.flags).test(
                    output.output
                ),
            };
        case 'max-cost-usd':
            return {
                assertion,
                passed: (output.costUsd ?? 0) <= assertion.value,
                detail: `cost=${output.costUsd ?? 0}`,
            };
        case 'max-duration-ms':
            return {
                assertion,
                passed: output.durationMs <= assertion.value,
                detail: `duration=${output.durationMs}`,
            };
        case 'custom':
            return { assertion, passed: assertion.predicate(output) };
        default: {
            const _exhaustive: never = assertion;
            return _exhaustive;
        }
    }
}

export interface RunHarnessOptions {
    /**
     * Allow live cases to run. Defaults to reading `OR3_EVAL_LIVE=1` from the
     * environment so live comparisons never run in ordinary unit tests.
     */
    allowLive?: boolean;
    env?: Record<string, string | undefined>;
}

function liveAllowed(options: RunHarnessOptions): boolean {
    if (typeof options.allowLive === 'boolean') return options.allowLive;
    const env =
        options.env ??
        (typeof process !== 'undefined' ? process.env : undefined);
    return env?.OR3_EVAL_LIVE === '1';
}

/** Run a suite of evaluation cases with a host-provided runner. */
export async function runEvaluationSuite(
    cases: EvaluationCase[],
    runner: EvaluationRunner,
    options: RunHarnessOptions = {}
): Promise<EvaluationResult[]> {
    const allowLive = liveAllowed(options);
    const results: EvaluationResult[] = [];

    for (const testCase of cases) {
        if (testCase.providerMode === 'live' && !allowLive) {
            results.push({
                caseId: testCase.id,
                candidateId: testCase.candidateId,
                skipped: true,
                passed: true,
                assertions: [],
            });
            continue;
        }
        try {
            const output = await runner(testCase);
            const assertions = testCase.assertions.map((a) =>
                evaluateAssertion(a, output)
            );
            // Merge limits as implicit assertions.
            if (testCase.limits?.maxCostUsd !== undefined) {
                assertions.push(
                    evaluateAssertion(
                        { kind: 'max-cost-usd', value: testCase.limits.maxCostUsd },
                        output
                    )
                );
            }
            if (testCase.limits?.maxDurationMs !== undefined) {
                assertions.push(
                    evaluateAssertion(
                        {
                            kind: 'max-duration-ms',
                            value: testCase.limits.maxDurationMs,
                        },
                        output
                    )
                );
            }
            results.push({
                caseId: testCase.id,
                candidateId: testCase.candidateId,
                skipped: false,
                passed: assertions.every((a) => a.passed),
                output,
                assertions,
            });
        } catch (err) {
            results.push({
                caseId: testCase.id,
                candidateId: testCase.candidateId,
                skipped: false,
                passed: false,
                assertions: [],
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return results;
}

/** Summ­arize suite results into a compact report. */
export interface EvaluationReport {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    totalCostUsd: number;
    totalDurationMs: number;
}

export function summarizeEvaluation(
    results: EvaluationResult[]
): EvaluationReport {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    for (const r of results) {
        if (r.skipped) skipped++;
        else if (r.passed) passed++;
        else failed++;
        totalCostUsd += r.output?.costUsd ?? 0;
        totalDurationMs += r.output?.durationMs ?? 0;
    }
    return {
        total: results.length,
        passed,
        failed,
        skipped,
        totalCostUsd,
        totalDurationMs,
    };
}

/**
 * Compare two candidates (e.g. models/routing/backends) over the same cases and
 * write isolated results per candidate (R8.AC5, R9.AC4).
 */
export interface CandidateComparison {
    candidates: string[];
    byCandidate: Record<string, EvaluationReport>;
    recommendation?: string;
}

export function compareCandidates(
    resultsByCandidate: Record<string, EvaluationResult[]>
): CandidateComparison {
    const candidates = Object.keys(resultsByCandidate);
    const byCandidate: Record<string, EvaluationReport> = {};
    for (const c of candidates) {
        byCandidate[c] = summarizeEvaluation(resultsByCandidate[c]);
    }
    // Recommend the candidate with most passes, then lowest cost.
    let recommendation: string | undefined;
    let best: EvaluationReport | undefined;
    for (const c of candidates) {
        const report = byCandidate[c];
        if (
            !best ||
            report.passed > best.passed ||
            (report.passed === best.passed &&
                report.totalCostUsd < best.totalCostUsd)
        ) {
            best = report;
            recommendation = c;
        }
    }
    return { candidates, byCandidate, recommendation };
}
