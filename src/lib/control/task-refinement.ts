import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const PROJECTS_FILE = path.join(OPERATIONS_DIR, 'projects', 'projects.json');

type ProjectEntry = {
  project_id: string;
  name: string;
  related_repo: string;
  type: string;
};

export type TicketRefinementInput = {
  title?: string | null;
  description?: string | null;
  intake_brief?: string | null;
  project_id?: string | null;
  related_repo?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
  assignee?: string | null;
  labels?: string[];
};

export type TicketRefinementResult = {
  title: string;
  description: string;
  intake_brief: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string | null;
  labels: string[];
  checklist: Array<{
    title: string;
    completed: boolean;
    position: number;
  }>;
  project_id: string | null;
  related_repo: string | null;
  refinement_source: 'agent:coach' | 'fallback';
  refinement_summary: string;
};

type WorkKind = 'engineering' | 'research' | 'consulting' | 'general';

function splitSentences(input: string): string[] {
  return input
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeMultiline(input: string): string {
  return input
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, array) => line || (index > 0 && array[index - 1]))
    .join('\n')
    .trim();
}

function toSentenceCase(input: string): string {
  const value = normalizeWhitespace(input);
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toTitle(input: string): string {
  const value = normalizeWhitespace(input);
  if (!value) {
    return 'Untitled task';
  }

  const trimmed = value.replace(/^[\-\*\d.\s]+/, '');
  if (trimmed.length <= 72) {
    return trimmed;
  }

  return `${trimmed.slice(0, 69).trimEnd()}...`;
}

function stripPunctuation(input: string): string {
  return normalizeWhitespace(input).replace(/[.!?]+$/, '').trim();
}

function firstUsefulLine(input: string): string {
  const lines = input
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  return lines[0] || '';
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function inferPriority(text: string): 'low' | 'medium' | 'high' | 'urgent' {
  const value = text.toLowerCase();
  if (/(urgent|asap|immediately|critical|production down|broken)/.test(value)) {
    return 'urgent';
  }
  if (/(important|high priority|soon|customer|blocking)/.test(value)) {
    return 'high';
  }
  if (/(cleanup|later|nice to have|optional)/.test(value)) {
    return 'low';
  }
  return 'medium';
}

function inferAssignee(text: string): string | null {
  const value = text.toLowerCase();
  if (/\b(research|investigate|find out|compare|analyze|latest|trend|trends|development|developments)\b/.test(value) || /^(what|which|why|how)\b/.test(value.trim())) {
    return 'researcher';
  }
  if (/(consult|consultancy|recommend|strategy|advise|advice|plan|scope|proposal|decision)/.test(value)) {
    return 'consultant';
  }
  if (/\b(test|verify|qa|regression|validate)\b/.test(value)) {
    return 'test';
  }
  if (/\b(review|pr|code review)\b/.test(value)) {
    return 'review';
  }
  if (/\b(plan|spec|scope|refine|ticket|workflow)\b/.test(value)) {
    return 'coach';
  }
  if (/\b(build|implement|code|fix|ui|bug|feature|api|db|database|frontend|backend)\b/.test(value)) {
    return 'engineer';
  }
  return 'rook';
}

function inferLabels(text: string): string[] {
  const value = text.toLowerCase();
  const labels: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\bbug|fix|broken|error\b/, 'bug'],
    [/\bui|ux|modal|button|layout|dashboard\b/, 'ui'],
    [/\bapi|route|endpoint\b/, 'api'],
    [/\bdb|database|sqlite|schema\b/, 'data'],
    [/\btest|qa|verify|validation\b/, 'testing'],
    [/\bdoc|docs|documentation|write-up\b/, 'docs'],
    [/\brefactor|cleanup|simplify\b/, 'refactor'],
    [/\bworkflow|pipeline|agent|automation\b/, 'automation'],
    [/\bresearch|investigate|analyze|compare|find out\b/, 'research'],
    [/\bconsult|consultancy|strategy|recommend|proposal|stakeholder|decision\b/, 'consulting'],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) {
      labels.push(label);
    }
  }

  return unique(labels);
}

function inferWorkKind(text: string): WorkKind {
  const value = text.toLowerCase();
  if (/\b(research|investigate|compare|analyze|find out|survey|benchmark|study|latest|trend|trends|development|developments)\b/.test(value) || /^(what|which|why|how)\b/.test(value.trim())) {
    return 'research';
  }
  if (/(consult|consultancy|strategy|recommend|proposal|scope|roadmap|decision|stakeholder|advice)/.test(value)) {
    return 'consulting';
  }
  if (/(build|implement|code|fix|ui|bug|feature|api|db|database|frontend|backend|deploy|devops)/.test(value)) {
    return 'engineering';
  }
  return 'general';
}

function parseChecklistFromBrief(input: string): string[] {
  const bulletLines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);

  if (bulletLines.length > 0) {
    return unique(bulletLines).slice(0, 8);
  }
  return [];
}

function normalizeChecklistItem(input: string): string {
  return toSentenceCase(input).replace(/[.]?$/, '');
}

function extractPrimaryObjective(input: string): string {
  const first = firstUsefulLine(input) || splitSentences(input)[0] || 'Clarify the requested work';
  return stripPunctuation(first);
}

function buildRefinedTitle(input: string, kind: WorkKind): string {
  const objective = extractPrimaryObjective(input);
  const lower = objective.toLowerCase();

  if (kind === 'research') {
    if (/^what is\b/.test(lower)) {
      return toTitle(objective.replace(/^what is the\s+/i, 'Research the ').replace(/^what is\s+/i, 'Research ').replace(/^research\s+/i, 'Research '));
    }
    if (!/^research\b/i.test(objective)) {
      return toTitle(`Research ${objective.charAt(0).toLowerCase()}${objective.slice(1)}`);
    }
  }

  if (kind === 'consulting') {
    if (!/^(design|define|improve|recommend|develop|plan)\b/i.test(objective)) {
      return toTitle(`Define ${objective.charAt(0).toLowerCase()}${objective.slice(1)}`);
    }
  }

  if (kind === 'engineering') {
    if (/move|reorder|shift/.test(lower) && /column/.test(lower) && /kanban/.test(lower)) {
      return 'Reorder Intake and Blocked columns in Kanban';
    }
    if (!/^(implement|fix|update|add|remove|reorder|refactor|improve)\b/i.test(objective)) {
      return toTitle(`Implement ${objective.charAt(0).toLowerCase()}${objective.slice(1)}`);
    }
  }

  return toTitle(objective);
}

function buildChecklist(
  input: string,
  title: string,
  kind: WorkKind
): Array<{ title: string; completed: boolean; position: number }> {
  const items = parseChecklistFromBrief(input);
  const kindFallbacks: Record<WorkKind, string[]> = {
    engineering: [
      `Inspect the affected code paths and confirm the concrete change needed for ${title.toLowerCase()}`,
      'Implement the required code and configuration changes in the target repository',
      'Run the relevant validation or test commands and record the result',
      'Update task notes with the delivered change and any follow-up risks',
    ],
    research: [
      `Define the research question and scope for ${title.toLowerCase()}`,
      'Collect the relevant sources, references, or comparison points',
      'Synthesize the findings into concise conclusions and recommendations',
      'Record the deliverable summary and any open questions in the task',
    ],
    consulting: [
      `Clarify the decision, stakeholder need, or problem statement behind ${title.toLowerCase()}`,
      'Assess the practical options, tradeoffs, and constraints',
      'Produce a recommendation with rationale and concrete next steps',
      'Record the proposed plan, owner, and outstanding risks in the task',
    ],
    general: [
      `Clarify the expected outcome for ${title.toLowerCase()}`,
      'Break the work into concrete execution steps',
      'Validate the result and record the evidence in the task',
    ],
  };

  return (items.length > 0 ? items : kindFallbacks[kind])
    .slice(0, 8)
    .map((item, index) => ({
      title: normalizeChecklistItem(item),
      completed: false,
      position: index,
    }));
}

function buildDescription(input: string, kind: WorkKind): string {
  const objective = extractPrimaryObjective(input);
  const contextLines = splitSentences(input)
    .slice(1, 4)
    .map((sentence) => stripPunctuation(sentence))
    .filter(Boolean);

  if (!objective) {
    return 'Convert this rough brief into a structured, agent-ready task with explicit scope, deliverable, and validation expectations.';
  }

  const sections: string[] = [];

  if (kind === 'engineering') {
    sections.push(`Objective:\n- ${toSentenceCase(objective)}`);
    sections.push(`Execution scope:\n- Convert the request into a concrete implementation change in the selected repository.\n- Keep the scope bounded and directly tied to the requested UI, API, or code behavior.\n- Preserve existing behavior outside the requested change.`);
    if (contextLines.length > 0) {
      sections.push(`Context and constraints:\n- ${contextLines.map(toSentenceCase).join('\n- ')}`);
    }
    sections.push('Definition of done:\n- The requested change is implemented.\n- Relevant validation or tests are run and recorded.\n- Follow-up risks or open questions are noted in the task.');
    return sections.join('\n\n');
  }

  if (kind === 'research') {
    sections.push(`Research objective:\n- ${toSentenceCase(objective)}`);
    sections.push('Expected deliverable:\n- Produce a concise research summary with the current findings, relevant sources, and the main implications.\n- Distinguish established facts from interpretation or open questions.');
    if (contextLines.length > 0) {
      sections.push(`Scope notes:\n- ${contextLines.map(toSentenceCase).join('\n- ')}`);
    }
    sections.push('Definition of done:\n- The research question is clearly answered.\n- The answer is grounded in identifiable sources or evidence.\n- Open gaps, uncertainty, or next research steps are noted.');
    return sections.join('\n\n');
  }

  if (kind === 'consulting') {
    sections.push(`Consulting objective:\n- ${toSentenceCase(objective)}`);
    sections.push('Expected deliverable:\n- Frame the decision or workflow problem clearly.\n- Assess the main options, tradeoffs, and constraints.\n- Produce a recommendation with concrete next steps.');
    if (contextLines.length > 0) {
      sections.push(`Context and assumptions:\n- ${contextLines.map(toSentenceCase).join('\n- ')}`);
    }
    sections.push('Definition of done:\n- The recommendation is actionable.\n- The reasoning behind it is explicit.\n- Risks, dependencies, and unresolved assumptions are documented.');
    return sections.join('\n\n');
  }

  sections.push(`Objective:\n- ${toSentenceCase(objective)}`);
  if (contextLines.length > 0) {
    sections.push(`Context:\n- ${contextLines.map(toSentenceCase).join('\n- ')}`);
  }
  sections.push('Definition of done:\n- The task scope is clear.\n- The expected deliverable is defined.\n- Validation or review expectations are recorded.');
  return sections.join('\n\n');
}

async function loadProjects(): Promise<ProjectEntry[]> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ProjectEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inferProjectFromText(projects: ProjectEntry[], text: string): ProjectEntry | null {
  const value = text.toLowerCase();
  const scored = projects
    .map((project) => {
      const tokens = [
        project.project_id,
        project.name,
        project.related_repo,
        project.related_repo.split('/').at(-1) || '',
      ].map((token) => token.toLowerCase());

      const score = tokens.reduce((sum, token) => {
        if (!token) return sum;
        if (value.includes(token)) return sum + 3;
        const tokenParts = token.split(/[^a-z0-9]+/).filter(Boolean);
        return sum + tokenParts.filter((part) => part.length > 2 && value.includes(part)).length;
      }, 0);

      return { project, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.project || null;
}

function extractJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractAssistantTextFromJson(stdout: string): string | null {
  const trimmed = stdout.trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart < 0) {
    return null;
  }

  try {
    const payload = JSON.parse(trimmed.slice(jsonStart));
    const entries = Array.isArray(payload?.payloads) ? payload.payloads : [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.role !== 'assistant' || !Array.isArray(entry?.content)) {
        continue;
      }
      const text = entry.content
        .filter((part: { type?: string; text?: string }) => part?.type === 'text')
        .map((part: { text?: string }) => part.text || '')
        .join('\n')
        .trim();
      if (text) {
        return text;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function refineWithCoachAgent(input: TicketRefinementInput): Promise<Partial<TicketRefinementResult> | null> {
  const workKind = inferWorkKind(
    normalizeWhitespace(input.intake_brief || [input.title, input.description].filter(Boolean).join('. '))
  );
  const prompt = [
    'Convert this rough kanban ticket into a structured, agent-ready task.',
    'Return exactly one JSON object and nothing else.',
    'JSON shape:',
    '{"title":"string","description":"string","priority":"low|medium|high|urgent","assignee":"rook|coach|consultant|engineer|researcher|test|review|health|null","labels":["string"],"checklist":["string"],"project_id":"string|null","related_repo":"owner/repo|null","summary":"string"}',
    'Rules:',
    '- Keep the meaning of the rough brief.',
    '- Make the title concrete and short.',
    '- Turn ambiguous wording into a task description with clear scope, deliverable, and validation expectations.',
    '- Checklist items must be short imperative steps.',
    '- Adapt the task style to the work type. Development tasks should be implementation-oriented. Research tasks should focus on question, evidence, and findings. Consulting tasks should focus on options, recommendation, and next steps.',
    '- If repo/project is unknown, return null for those fields.',
    `- Inferred work type: ${workKind}.`,
    '',
    JSON.stringify(input),
  ].join('\n');

  try {
    const { stdout } = await execFileAsync(
      'openclaw',
      ['agent', '--agent', 'coach', '--message', prompt, '--timeout', '25', '--json'],
      {
        cwd: '/root/.openclaw',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      }
    );

    const assistantText = extractAssistantTextFromJson(stdout);
    const jsonText = assistantText ? extractJsonObject(assistantText) : null;
    if (!jsonText) {
      return null;
    }

    const parsed = JSON.parse(jsonText) as {
      title?: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      assignee?: string | null;
      labels?: string[];
      checklist?: string[];
      project_id?: string | null;
      related_repo?: string | null;
      summary?: string;
    };

    return {
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      assignee: parsed.assignee ?? null,
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      checklist: Array.isArray(parsed.checklist)
        ? parsed.checklist.map((item, index) => ({
            title: toSentenceCase(String(item)),
            completed: false,
            position: index,
          }))
        : [],
      project_id: parsed.project_id ?? null,
      related_repo: parsed.related_repo ?? null,
      refinement_summary: parsed.summary || 'Refined by coach agent.',
      refinement_source: 'agent:coach',
    };
  } catch {
    return null;
  }
}

export async function refineTaskDraft(input: TicketRefinementInput): Promise<TicketRefinementResult> {
  const intakeBrief = normalizeWhitespace(
    input.intake_brief || [input.title, input.description].filter(Boolean).join('. ')
  );
  const baseText = intakeBrief || normalizeWhitespace(input.description || input.title || '');
  const projects = await loadProjects();

  const agentResult = await refineWithCoachAgent({
    ...input,
    intake_brief: intakeBrief,
  });

  const inferredProject =
    (input.project_id
      ? projects.find((project) => project.project_id === input.project_id) || null
      : null) ||
    (input.related_repo
      ? projects.find((project) => project.related_repo === input.related_repo) || null
      : null) ||
    inferProjectFromText(projects, baseText);
  const workKind = inferWorkKind(baseText);

  const fallbackTitle = toTitle(input.title || firstUsefulLine(baseText) || 'Untitled task');
  const refinedFallbackTitle = buildRefinedTitle(baseText, workKind);
  const fallbackDescription = buildDescription(baseText, workKind);
  const fallbackChecklist = buildChecklist(baseText, refinedFallbackTitle, workKind);
  const fallbackLabels = unique([...(input.labels || []), ...inferLabels(baseText)]);
  const fallbackPriority = input.priority || inferPriority(baseText);
  const fallbackAssignee = input.assignee || inferAssignee(baseText);

  return {
    title: toTitle(agentResult?.title || refinedFallbackTitle || fallbackTitle),
    description: normalizeMultiline(agentResult?.description || fallbackDescription),
    intake_brief: intakeBrief || fallbackDescription,
    priority: agentResult?.priority || fallbackPriority,
    assignee: agentResult?.assignee === undefined ? fallbackAssignee : agentResult.assignee,
    labels: unique(
      [...(Array.isArray(agentResult?.labels) ? agentResult?.labels : []), ...fallbackLabels]
        .map((label) => normalizeWhitespace(label).toLowerCase())
        .filter(Boolean)
    ),
    checklist:
      Array.isArray(agentResult?.checklist) && agentResult.checklist.length > 0
        ? agentResult.checklist.slice(0, 8).map((item, index) => ({
            title: toSentenceCase(item.title),
            completed: false,
            position: index,
          }))
        : fallbackChecklist,
    project_id: agentResult?.project_id || input.project_id || inferredProject?.project_id || null,
    related_repo: agentResult?.related_repo || input.related_repo || inferredProject?.related_repo || null,
    refinement_source: agentResult?.refinement_source || 'fallback',
    refinement_summary:
      agentResult?.refinement_summary ||
      `Structured from the rough brief with the local fallback refiner for ${workKind} work.`,
  };
}
