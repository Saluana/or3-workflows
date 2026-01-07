import { describe, it, expect, vi } from 'vitest';
import {
    isHITLMode,
    isHITLConfig,
    isHITLRequest,
    isHITLResponse,
    generateHITLRequestId,
    createDefaultHITLConfig,
    getDefaultApprovalOptions,
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
} from '../hitl';

describe('HITL Type Guards', () => {
    describe('isHITLMode', () => {
        it('should return true for valid HITL modes', () => {
            expect(isHITLMode('approval')).toBe(true);
            expect(isHITLMode('input')).toBe(true);
            expect(isHITLMode('review')).toBe(true);
        });

        it('should return false for invalid values', () => {
            expect(isHITLMode('invalid')).toBe(false);
            expect(isHITLMode('')).toBe(false);
            expect(isHITLMode(null)).toBe(false);
            expect(isHITLMode(undefined)).toBe(false);
            expect(isHITLMode(123)).toBe(false);
            expect(isHITLMode({})).toBe(false);
        });
    });

    describe('isHITLConfig', () => {
        it('should return true for valid minimal config', () => {
            const config: HITLConfig = {
                enabled: true,
                mode: 'approval',
            };
            expect(isHITLConfig(config)).toBe(true);
        });

        it('should return true for valid full config', () => {
            const config: HITLConfig = {
                enabled: true,
                mode: 'review',
                prompt: 'Please review this',
                timeout: 30000,
                defaultAction: 'approve',
                inputSchema: { type: 'object' },
                options: [
                    { id: 'approve', label: 'Approve', action: 'approve' },
                    { id: 'reject', label: 'Reject', action: 'reject' },
                ],
            };
            expect(isHITLConfig(config)).toBe(true);
        });

        it('should return false for missing enabled', () => {
            expect(isHITLConfig({ mode: 'approval' })).toBe(false);
        });

        it('should return false for missing mode', () => {
            expect(isHITLConfig({ enabled: true })).toBe(false);
        });

        it('should return false for invalid mode', () => {
            expect(isHITLConfig({ enabled: true, mode: 'invalid' })).toBe(
                false
            );
        });

        it('should return false for invalid enabled type', () => {
            expect(isHITLConfig({ enabled: 'true', mode: 'approval' })).toBe(
                false
            );
        });

        it('should return false for invalid prompt type', () => {
            expect(
                isHITLConfig({ enabled: true, mode: 'approval', prompt: 123 })
            ).toBe(false);
        });

        it('should return false for invalid timeout type', () => {
            expect(
                isHITLConfig({
                    enabled: true,
                    mode: 'approval',
                    timeout: 'invalid',
                })
            ).toBe(false);
        });

        it('should return false for invalid defaultAction', () => {
            expect(
                isHITLConfig({
                    enabled: true,
                    mode: 'approval',
                    defaultAction: 'invalid',
                })
            ).toBe(false);
        });

        it('should return false for null or undefined', () => {
            expect(isHITLConfig(null)).toBe(false);
            expect(isHITLConfig(undefined)).toBe(false);
        });
    });

    describe('isHITLRequest', () => {
        const validRequest: HITLRequest = {
            id: 'hitl_123',
            nodeId: 'node-1',
            nodeLabel: 'Agent Node',
            mode: 'approval',
            prompt: 'Please approve',
            context: {
                input: 'test input',
                workflowName: 'Test Workflow',
            },
            createdAt: new Date().toISOString(),
        };

        it('should return true for valid request', () => {
            expect(isHITLRequest(validRequest)).toBe(true);
        });

        it('should return true for request with optional fields', () => {
            const requestWithOptional = {
                ...validRequest,
                context: {
                    ...validRequest.context,
                    output: 'test output',
                    sessionId: 'session-1',
                },
                options: [
                    { id: 'approve', label: 'Approve', action: 'approve' },
                ],
                expiresAt: new Date().toISOString(),
            };
            expect(isHITLRequest(requestWithOptional)).toBe(true);
        });

        it('should return false for missing required fields', () => {
            expect(isHITLRequest({ ...validRequest, id: undefined })).toBe(
                false
            );
            expect(isHITLRequest({ ...validRequest, nodeId: undefined })).toBe(
                false
            );
            expect(isHITLRequest({ ...validRequest, mode: undefined })).toBe(
                false
            );
            expect(isHITLRequest({ ...validRequest, prompt: undefined })).toBe(
                false
            );
            expect(isHITLRequest({ ...validRequest, context: undefined })).toBe(
                false
            );
            expect(
                isHITLRequest({ ...validRequest, createdAt: undefined })
            ).toBe(false);
        });

        it('should return false for invalid mode', () => {
            expect(isHITLRequest({ ...validRequest, mode: 'invalid' })).toBe(
                false
            );
        });

        it('should return false for null or undefined', () => {
            expect(isHITLRequest(null)).toBe(false);
            expect(isHITLRequest(undefined)).toBe(false);
        });
    });

    describe('isHITLResponse', () => {
        const validResponse: HITLResponse = {
            requestId: 'hitl_123',
            action: 'approve',
            respondedAt: new Date().toISOString(),
        };

        it('should return true for valid response', () => {
            expect(isHITLResponse(validResponse)).toBe(true);
        });

        it('should return true for all valid actions', () => {
            const actions: HITLResponse['action'][] = [
                'approve',
                'reject',
                'submit',
                'modify',
                'skip',
            ];
            actions.forEach((action) => {
                expect(isHITLResponse({ ...validResponse, action })).toBe(true);
            });
        });

        it('should return true for response with optional fields', () => {
            const responseWithOptional = {
                ...validResponse,
                data: 'modified content',
                respondedBy: 'user-1',
            };
            expect(isHITLResponse(responseWithOptional)).toBe(true);
        });

        it('should return false for missing required fields', () => {
            expect(
                isHITLResponse({ ...validResponse, requestId: undefined })
            ).toBe(false);
            expect(
                isHITLResponse({ ...validResponse, action: undefined })
            ).toBe(false);
            expect(
                isHITLResponse({ ...validResponse, respondedAt: undefined })
            ).toBe(false);
        });

        it('should return false for invalid action', () => {
            expect(
                isHITLResponse({ ...validResponse, action: 'invalid' })
            ).toBe(false);
        });

        it('should return false for null or undefined', () => {
            expect(isHITLResponse(null)).toBe(false);
            expect(isHITLResponse(undefined)).toBe(false);
        });
    });
});

describe('HITL Utility Functions', () => {
    describe('generateHITLRequestId', () => {
        it('should generate unique IDs', () => {
            const id1 = generateHITLRequestId();
            const id2 = generateHITLRequestId();
            expect(id1).not.toBe(id2);
        });

        it('should generate IDs with hitl_ prefix', () => {
            const id = generateHITLRequestId();
            expect(id.startsWith('hitl_')).toBe(true);
        });

        it('should generate IDs of reasonable length', () => {
            const id = generateHITLRequestId();
            expect(id.length).toBeGreaterThan(10);
            expect(id.length).toBeLessThan(50);
        });
    });

    describe('createDefaultHITLConfig', () => {
        it('should create default config with disabled state', () => {
            const config = createDefaultHITLConfig();
            expect(config.enabled).toBe(false);
            expect(config.mode).toBe('approval');
        });

        it('should allow overriding defaults', () => {
            const config = createDefaultHITLConfig({
                enabled: true,
                mode: 'review',
                prompt: 'Custom prompt',
            });
            expect(config.enabled).toBe(true);
            expect(config.mode).toBe('review');
            expect(config.prompt).toBe('Custom prompt');
        });
    });

    describe('getDefaultApprovalOptions', () => {
        it('should return approve and reject options', () => {
            const options = getDefaultApprovalOptions();
            expect(options).toHaveLength(2);
            expect(options?.find((o) => o.action === 'approve')).toBeDefined();
            expect(options?.find((o) => o.action === 'reject')).toBeDefined();
        });

        it('should have proper structure', () => {
            const options = getDefaultApprovalOptions();
            options?.forEach((option) => {
                expect(option).toHaveProperty('id');
                expect(option).toHaveProperty('label');
                expect(option).toHaveProperty('action');
            });
        });
    });
});

describe('HITL Integration', () => {
    it('should work with execution options pattern', async () => {
        // Simulate how a developer would use HITL
        const mockCallback = vi.fn(
            async (request: HITLRequest): Promise<HITLResponse> => {
                expect(isHITLRequest(request)).toBe(true);
                return {
                    requestId: request.id,
                    action: 'approve',
                    respondedAt: new Date().toISOString(),
                };
            }
        );

        // Simulate a HITL request
        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: 'agent-1',
            nodeLabel: 'Decision Agent',
            mode: 'approval',
            prompt: 'Approve this decision?',
            context: {
                input: 'Should we proceed with the plan?',
                workflowName: 'Decision Workflow',
            },
            createdAt: new Date().toISOString(),
        };

        const response = await mockCallback(request);
        expect(isHITLResponse(response)).toBe(true);
        expect(response.action).toBe('approve');
        expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout scenario', async () => {
        const config: HITLConfig = {
            enabled: true,
            mode: 'approval',
            timeout: 100,
            defaultAction: 'reject',
        };

        // Simulate timeout behavior
        const slowCallback = vi.fn(
            async (request: HITLRequest): Promise<HITLResponse> => {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return {
                    requestId: request.id,
                    action: 'approve',
                    respondedAt: new Date().toISOString(),
                };
            }
        );

        const timeoutPromise = new Promise<HITLResponse>((resolve) => {
            setTimeout(() => {
                resolve({
                    requestId: 'test',
                    action:
                        config.defaultAction === 'approve'
                            ? 'approve'
                            : 'reject',
                    respondedAt: new Date().toISOString(),
                });
            }, config.timeout);
        });

        const request: HITLRequest = {
            id: 'test',
            nodeId: 'node-1',
            nodeLabel: 'Test',
            mode: 'approval',
            prompt: 'Test',
            context: {
                input: 'test',
                workflowName: 'test',
            },
            createdAt: new Date().toISOString(),
        };

        const result = await Promise.race([
            slowCallback(request),
            timeoutPromise,
        ]);

        // Timeout should win
        expect(result.action).toBe('reject');
    });

    it('should handle input mode with data', async () => {
        const mockCallback = vi.fn(
            async (request: HITLRequest): Promise<HITLResponse> => {
                expect(request.mode).toBe('input');
                return {
                    requestId: request.id,
                    action: 'submit',
                    data: { userInput: 'Custom user input' },
                    respondedAt: new Date().toISOString(),
                };
            }
        );

        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: 'input-agent',
            nodeLabel: 'Input Agent',
            mode: 'input',
            prompt: 'Please provide your input',
            context: {
                input: '',
                workflowName: 'Input Workflow',
            },
            inputSchema: {
                type: 'object',
                properties: {
                    userInput: { type: 'string' },
                },
            },
            createdAt: new Date().toISOString(),
        };

        const response = await mockCallback(request);
        expect(response.action).toBe('submit');
        expect(response.data).toEqual({ userInput: 'Custom user input' });
    });

    it('should handle review mode with modifications', async () => {
        const originalOutput = 'Original LLM output';
        const modifiedOutput = 'Modified output by human';

        const mockCallback = vi.fn(
            async (request: HITLRequest): Promise<HITLResponse> => {
                expect(request.mode).toBe('review');
                expect(request.context.output).toBe(originalOutput);
                return {
                    requestId: request.id,
                    action: 'modify',
                    data: modifiedOutput,
                    respondedAt: new Date().toISOString(),
                };
            }
        );

        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: 'review-agent',
            nodeLabel: 'Review Agent',
            mode: 'review',
            prompt: 'Review this output',
            context: {
                input: 'Original input',
                output: originalOutput,
                workflowName: 'Review Workflow',
            },
            createdAt: new Date().toISOString(),
        };

        const response = await mockCallback(request);
        expect(response.action).toBe('modify');
        expect(response.data).toBe(modifiedOutput);
    });
});
