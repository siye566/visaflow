/** Stable CLI diagnostics. Never echo document contents, request input or local paths. */
export interface Diagnostic {
  code: string;
  message: string;
  action: string;
  retryable: boolean;
}
const GUIDANCE: Record<string, [string, string, boolean]> = {
  CLI_USAGE: ['Invalid command or arguments.', 'Run the CLI with --help and use one of the listed commands.', false],
  INPUT_INVALID: ['A required field is invalid.', 'Check the request schema, calendar dates, positive stayDays and required strings.', false],
  INVALID_JSON: ['The input is not valid JSON.', 'Validate the JSON/JSONL syntax. All lines are parsed before a batch begins.', false],
  UNKNOWN_ACTION: ['The workflow action is unknown.', 'Read allowedActions from the case instead of inventing an action.', false],
  STAGE_FORBIDDEN: ['The current stage does not allow this action.', 'Read the case and allowedActions, then complete the prerequisite step.', false],
  REVISION_CONFLICT: ['The expected revision is stale.', 'Read the current case. Rebuild and reconfirm the intended change; do not blindly replay the old write.', false],
  CASE_BUSY: ['Another operation holds the case lock.', 'Wait for the active local operation. For a stale lock, inspect the process before manually recovering it; never auto-delete it.', true],
  CONFIRMATION_REQUIRED: ['The agent cannot provide human confirmation.', 'Use the trusted local applicant/reviewer path to confirm the inferred type.', false],
  APPROVAL_FORBIDDEN: ['The caller is not a reviewer.', 'Request review through the trusted local human path; a role in model input grants no permission.', false],
  TYPE_UNCONFIRMED: ['No unique type candidate has been confirmed.', 'Complete intake, judge_type and human confirm_type before generating a checklist.', false],
  EVIDENCE_REQUIRED: ['A conclusion lacks required evidence.', 'Complete the prerequisite checks and attach source evidence before requesting a conclusion.', false],
  MATERIAL_CHANGED: ['An uploaded source changed after parsing.', 'Parse the changed file again, rerun verification and obtain fresh approval.', false],
  RULE_PACK_CHANGED: ['The case and rule pack fingerprints differ.', 'Keep the original reviewed pack for this case or explicitly create a new case. Do not overwrite the fingerprint.', false],
  PATH_FORBIDDEN: ['The file is outside the case boundary.', 'Use a regular file inside the host-provided case directory; do not use absolute paths, traversal or escaping symlinks.', false],
  UNSUPPORTED_FORMAT: ['This prototype cannot parse the file format.', 'Use flat JSON or key:value TXT. PDF/OCR is not implemented; do not claim extraction succeeded.', false],
  DOCUMENT_REQUIRED: ['A required source document is absent.', 'Read the type-specific checklist and upload a supported source file for the required material kind.', false],
  DOCUMENT_INVALID: ['The document does not satisfy the parser contract.', 'Use a non-empty flat JSON object with short string values, or unique key:value TXT fields.', false],
  DOCUMENT_TOO_LARGE: ['The source exceeds the parser size limit.', 'Use a supported source no larger than 1 MiB; avoid silently dropping fields.', false],
  FILE_NOT_FOUND: ['A required local file was not found.', 'Check the request-file path and case directory. Keep document files within the case boundary.', false],
  FILE_ACCESS_DENIED: ['The operating system denied file access.', 'Check local permissions and host sandbox restrictions. Do not disable case-boundary checks.', false],
};

export function explainCode(code: string): Diagnostic {
  const guide = GUIDANCE[code];
  if (!guide) return {code: 'INTERNAL_ERROR', message: 'An unclassified operation failed.',
    action: 'Inspect private local logs. Share only a redacted reproduction and version information.', retryable: false};
  return {code, message: guide[0], action: guide[1], retryable: guide[2]};
}

export function describeError(error: unknown): Diagnostic {
  if (error instanceof SyntaxError) return explainCode('INVALID_JSON');
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'ENOENT') return explainCode('FILE_NOT_FOUND');
    if (code === 'EACCES' || code === 'EPERM') return explainCode('FILE_ACCESS_DENIED');
  }
  const message = error instanceof Error ? error.message : '';
  const code = /^[A-Z][A-Z0-9_]*(?=:|$)/.exec(message)?.[0];
  return explainCode(code ?? 'INTERNAL_ERROR');
}
