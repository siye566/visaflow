import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { errorResponse } from '../response.ts';
import { runCase } from '../../../visa-domain/src/store.ts';
import type { Request } from '../../../visa-domain/src/engine.ts';

/** Trusted session root and agent identity are assigned by the host, not model arguments. */
export async function handleVisaWorkflow(ctx: SessionToolContext, args: Request): Promise<ToolResult> {
  if (!ctx.sessionPath) return errorResponse('VisaFlow requires a host-provided sessionPath');
  try {
    const result = await runCase(ctx.sessionPath, args, {role: 'agent', name: ctx.sessionId});
    return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result as unknown as Record<string, unknown>, isError: false};
  } catch (error) { return errorResponse((error as Error).message); }
}
export async function handleVisaCaseRead(ctx: SessionToolContext): Promise<ToolResult> {
  return handleVisaWorkflow(ctx, {action: 'read'});
}
