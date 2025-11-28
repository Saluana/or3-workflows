import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflow } from '../src/builder';
import { OpenRouter } from '@openrouter/sdk';

// Mock OpenRouter client
const mockSend = vi.fn();
const mockClient = {
  chat: {
    send: mockSend,
  },
} as unknown as OpenRouter;

describe('Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a sequential workflow', async () => {
    mockSend.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello world',
          },
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });

    const wf = workflow(mockClient)
      .step({
        model: 'openai/gpt-3.5-turbo',
        prompt: 'Say hello',
      });

    const result = await wf.run('Start');

    expect(result.output).toBe('Hello world');
    expect(result.steps).toHaveLength(1);
    expect(result.usage.total_tokens).toBe(15);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      model: 'openai/gpt-3.5-turbo',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Say hello\n\nStart' }),
      ]),
    }));
  });

  it('should execute a parallel workflow', async () => {
    mockSend
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'Output 1' } }],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'Output 2' } }],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      });

    const wf = workflow(mockClient)
      .parallel([
        { model: 'model1', prompt: 'Task 1' },
        { model: 'model2', prompt: 'Task 2' },
      ]);

    const result = await wf.run('Start');

    expect(result.output).toContain('## Output 1');
    expect(result.output).toContain('## Output 2');
    expect(result.steps).toHaveLength(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
