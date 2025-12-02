import { z } from 'zod';

// HITL config schema for node data validation
export const HITLConfigSchema = z
    .object({
        enabled: z.boolean(),
        mode: z.enum(['approval', 'input', 'review']),
        message: z.string().optional(),
        timeout: z.number().optional(),
        defaultAction: z.enum(['approve', 'reject', 'skip']).optional(),
    })
    .optional();
