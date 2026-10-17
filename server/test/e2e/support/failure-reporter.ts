import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Reporter, TestCase, TestModule, Vitest } from 'vitest/node';
import { classifyThirdParty, type FailureKind } from './classify';
import { redact } from './redact';
import type { Step } from './http';

interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  expected?: string;
  actual?: string;
}

interface Row {
  flow: string;
  name: string;
  state: 'passed' | 'failed' | 'skipped';
  kind?: FailureKind;
  file?: string;
}

const flowOf = (moduleId: string) => basename(moduleId).replace(/\.e2e-spec\.ts$/, '');
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Class of a failure from the tagged message, then from what the recorded steps show */
function classify(error: SerializedError, steps: Step[]): FailureKind {
  const tag = /^\[(THIRD_PARTY_[A-Z]+|BLOCKED)\]/.exec(error.message);
  if (tag) return tag[1] as FailureKind;
  const brokenStep = steps.some(
    (step) =>
      (step.kind === 'http' && step.status >= 500) ||
      (step.kind === 'sse' && (step.status >= 500 || step.frames.some((frame) => frame.includes('"type":"error"')))),
  );
  if (brokenStep) {
    const text = steps.map((step) => JSON.stringify(step)).join('\n');
    return classifyThirdParty(text) ?? 'APP_ERROR';
  }
  return error.name === 'AssertionError' ? 'ASSERTION' : 'TEST_ERROR';
}

function mechanicalReason(kind: FailureKind, error: SerializedError, steps: Step[]): string[] {
  const lines: string[] = [];
  const bad = [...steps].reverse().find((step) => (step.kind === 'http' && step.status >= 400) || step.kind === 'sse');
  if (kind === 'ASSERTION') {
    lines.push('An assertion did not hold; the API answered but not with what the flow expects.');
    if (error.expected !== undefined || error.actual !== undefined) {
      lines.push(`Expected: ${error.expected}`, `Actual: ${error.actual}`);
    }
  } else if (kind === 'APP_ERROR') {
    lines.push('The app answered with a 5xx or sent an SSE `error` frame that is not a provider failure.');
  } else if (kind === 'BLOCKED') {
    lines.push('Not run: an earlier test found a third-party failure and wrote the STOP marker.');
  } else if (kind === 'TEST_ERROR') {
    lines.push('The test threw a non-assertion error (timeout, bad prerequisite or a bug in the test).');
  } else {
    lines.push(`The provider rejected the call (${kind}). Verify the key, quota or model before re-running.`);
  }
  if (bad?.kind === 'http') lines.push(`Last non-2xx call: ${bad.method} ${bad.path} -> ${bad.status}`);
  return lines;
}

function renderStep(step: Step, index: number): string[] {
  const head = `### ${index + 1}.`;
  if (step.kind === 'note') return [`${head} note`, '', step.text, ''];
  if (step.kind === 'http') {
    return [
      `${head} ${step.method} ${step.path} -> ${step.status} (${step.ms} ms)`,
      '',
      ...(step.request ? ['Request:', '```json', step.request, '```'] : []),
      'Response:',
      '```json',
      step.response,
      '```',
      '',
    ];
  }
  return [
    `${head} POST ${step.path} (SSE) -> ${step.status} (${step.ms} ms)`,
    '',
    'Request:',
    '```json',
    step.request,
    '```',
    'Frames:',
    '```',
    ...step.frames,
    '```',
    '',
  ];
}

export default class FailureReporter implements Reporter {
  private runDir = '';
  private rows: Row[] = [];
  private seq = 0;

  onInit(vitest: Vitest) {
    this.runDir = (vitest.config.env as Record<string, string>).E2E_RUN_DIR;
    mkdirSync(this.runDir, { recursive: true });
  }

  private write(name: string, lines: string[]) {
    writeFileSync(join(this.runDir, name), redact(lines.join('\n')) + '\n');
  }

  onTestCaseResult(testCase: TestCase) {
    const flow = flowOf(testCase.module.moduleId);
    const result = testCase.result();
    if (result.state !== 'failed') {
      this.rows.push({ flow, name: testCase.fullName, state: result.state === 'passed' ? 'passed' : 'skipped' });
      return;
    }

    const errors = result.errors as ReadonlyArray<SerializedError>;
    const steps = ((testCase.meta() as { steps?: Step[] }).steps ?? []) as Step[];
    const first = errors[0] ?? { message: '(no error recorded)' };
    const kind = classify(first, steps);
    const file = `${flow}__${String(++this.seq).padStart(2, '0')}-${slug(testCase.name)}.md`;

    this.write(file, [
      `# ${flow}: ${testCase.name}`,
      '',
      `- Flow: ${flow}`,
      `- Test: ${testCase.fullName}`,
      `- Classification: ${kind}`,
      `- Duration: ${testCase.diagnostic()?.duration ?? '?'} ms`,
      '',
      '## Why it failed',
      '',
      ...mechanicalReason(kind, first, steps).map((line) => `- ${line}`),
      '',
      '## Error',
      '',
      '```',
      first.message,
      ...(first.stack ? ['', ...first.stack.split('\n').slice(0, 12)] : []),
      '```',
      '',
      `## Steps (${steps.length})`,
      '',
      ...(steps.length > 0 ? steps.flatMap(renderStep) : ['No request was recorded before the failure.', '']),
      '## Analysis',
      '',
      '_To fill in after reading the steps: app bug, test bug or model behaviour._',
    ]);
    this.rows.push({ flow, name: testCase.fullName, state: 'failed', kind, file });
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    // Hook failures (beforeAll: login, boot) are module errors, not test failures
    for (const module of testModules) {
      const errors = module.errors() as SerializedError[];
      if (errors.length === 0) continue;
      const flow = flowOf(module.moduleId);
      const first = errors[0];
      const kind = classify(first, []);
      const file = `${flow}__hook-error.md`;
      this.write(file, [
        `# ${flow}: setup/teardown failed`,
        '',
        `- Classification: ${kind}`,
        '',
        '```',
        ...errors.flatMap((error) => [error.message, ...(error.stack ?? '').split('\n').slice(0, 10), '']),
        '```',
      ]);
      this.rows.push({ flow, name: '(setup/teardown)', state: 'failed', kind, file });
    }

    const flows = [...new Set(this.rows.map((row) => row.flow))];
    const count = (flow: string, state: Row['state']) =>
      this.rows.filter((row) => row.flow === flow && row.state === state).length;
    const failures = this.rows.filter((row) => row.state === 'failed');
    const stopFile = join(this.runDir, 'STOP');

    this.write('summary.md', [
      `# E2E run ${basename(this.runDir)}`,
      '',
      existsSync(join(this.runDir, '00-preflight.md')) ? '- Preflight: [00-preflight.md](00-preflight.md)' : '',
      existsSync(stopFile)
        ? `- STOP marker present, a third-party failure ended the run:\n\n\`\`\`json\n${readFileSync(stopFile, 'utf8')}\n\`\`\``
        : '- No STOP marker.',
      '',
      '| Flow | Passed | Failed | Skipped |',
      '|---|---|---|---|',
      ...flows.map((flow) => `| ${flow} | ${count(flow, 'passed')} | ${count(flow, 'failed')} | ${count(flow, 'skipped')} |`),
      '',
      failures.length > 0 ? '## Failures' : 'No failures.',
      '',
      ...failures.map((row) => `- [${row.flow}: ${row.name}](${row.file}) (${row.kind})`),
    ]);
  }
}
