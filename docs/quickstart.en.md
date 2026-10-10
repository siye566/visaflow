# First VisaFlow workflow and failure replay

Run the deterministic domain workflow in a terminal before installing the full desktop
app. No API key, model call, Bun, Electron install or npm install is needed for this demo.
The default destination and rule pack are fictitious `DEMO` engineering fixtures, not
current visa policies or immigration advice.

## 1. Check Node and run the first case

Use Node **22.18+**, from the repository root:

```sh
node --version
node --experimental-strip-types packages/visa-domain/src/cli.ts doctor
node --experimental-strip-types packages/visa-domain/src/cli.ts demo normal
```

The output contains `caseDirectory`, `state` and `allowedActions`.
Expected: `state.verification.status` is `pass`, while `state.approval.status` is still
`pending`. A verification pass does not make the agent a reviewer.
The demo writes synthetic documents, case state and traces to a temporary directory.
It intentionally retains the directory for inspection/replay; remove only that exact
generated directory after inspection. Never use real passports in a public demo.

## 2. Understand a blocked case

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts demo name-conflict
node --experimental-strip-types packages/visa-domain/src/cli.ts demo missing
node --experimental-strip-types packages/visa-domain/src/cli.ts demo ambiguous
```

| Case | Expected behavior |
| --- | --- |
| `name-conflict` | Verification is blocked, with source locations for conflicting values. The agent does not choose a winner. |
| `missing` | Required checklist items remain missing. No unsupported passing conclusion. |
| `ambiguous` | Type remains undetermined; obtain clarification before a checklist. |

These are valid business outcomes, not runtime crashes. A demo command may exit zero
while returning a blocked case. Check business state as well as the process exit code.

## 3. Replay the evidence

Copy `caseDirectory` from a demo result and replace the placeholder below:

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts replay "<caseDirectory>"
node --experimental-strip-types packages/visa-domain/src/eval.ts
```

Replay uses captured bytes and deterministic engine state; it does not call a live LLM,
redo external writes or prove that real-world rules are correct. Rule/prompt/tool version
drift requires an explicit new evaluation baseline, not a silent fingerprint override.

## 4. Tool calling from a script

Create a local `request.json` for a case's allowed action. For example, a read-only call:

```json
{"action":"read"}
```

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts call "<caseDirectory>" request.json
node --experimental-strip-types packages/visa-domain/src/cli.ts explain REVISION_CONFLICT
```

Every mutation needs the revision read from the current case. The host MCP adapter sets
the case path and agent principal; a `role` in model input cannot grant approval rights.
CLI roles are trusted **local operator assertions**, not remote authentication.

## Error contract

Successful call/batch results remain JSON on stdout. Failure diagnostics are one JSON
object on stderr, with a nonzero exit code:

```json
{"ok":false,"error":{"code":"REVISION_CONFLICT","message":"The expected revision is stale.","action":"Read the current case. Rebuild and reconfirm the intended change; do not blindly replay the old write.","retryable":false},"completedRequests":1}
```

`completedRequests` counts successful `call`/`batch` requests in this CLI invocation.
A batch is **not atomic**: earlier calls may already have committed. Read the current
case before resuming; never blindly resubmit the whole batch. `retryable` is guidance,
not an automatic-retry instruction or proof that no side effect occurred.

| Error | Next step |
| --- | --- |
| `STAGE_FORBIDDEN` | Read `allowedActions` and satisfy the prerequisite stage. |
| `CONFIRMATION_REQUIRED` / `APPROVAL_FORBIDDEN` | Ask a trusted local human; do not impersonate them in input. |
| `MATERIAL_CHANGED` | Parse the changed file, reverify, then obtain fresh approval. |
| `RULE_PACK_CHANGED` | Keep the original reviewed pack, or explicitly create a new case. |
| `PATH_FORBIDDEN` | Keep a regular source file inside the host-provided case directory. |
| `UNSUPPORTED_FORMAT` | Use flat JSON or key:value TXT. PDF/OCR is not implemented. |
| `CASE_BUSY` | Wait for the owner. Investigate stale locks; never auto-delete an active lock. |
| `FILE_ACCESS_DENIED` | Check OS/host sandbox permissions without weakening file-boundary checks. |
| `INVALID_JSON` | Fix syntax. All JSONL lines are parsed before batch execution begins. |

Use `explain <ERROR_CODE>` for other supported diagnostics. Unknown errors are redacted
as `INTERNAL_ERROR`; share a synthetic reproduction, not raw applicant data.

## 5. Run the domain tests

```sh
node --experimental-strip-types --test packages/visa-domain/src/*.test.ts
```

For TypeScript checking, install only the isolated package dependencies:

```sh
cd packages/visa-domain
npm ci --ignore-scripts --workspaces=false
npm run typecheck
```

## Where a sandbox would fit

The current domain tools do not run agent-generated code, and directory/revision checks
are application-level controls, not OS isolation. A future untrusted PDF converter or
generated normalization program could run in a disposable microVM with only staged
input, constrained resources and no credentials. Its output would remain evidence data;
the host would still validate rule versions, fields and human approval. Such a converter
and sandbox integration are **not implemented** in VisaFlow by this change.

## Onboarding measurement plan

In a usability session, time environment check → first case → understood blocked case
→ replay. Label failures as runtime, file permissions, tool contract or business outcome.
Store only redacted codes/versions with consent. This guide defines the funnel but does
not collect telemetry or claim a measured activation rate/ten-minute completion rate.
