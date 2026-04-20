function normalizeName(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function repoTail(relatedRepo: string | null | undefined): string {
  return String(relatedRepo || '').trim().split('/').at(-1) || '';
}

export interface ProjectRegistryEntry {
  project_id: string;
  name: string;
  related_repo: string;
  type: string;
}

const BOARD_DEFAULT_PROJECT: Record<string, string> = {
  [normalizeName('Rook System')]: 'rook-workspace',
  [normalizeName('Consulting')]: 'rook-workspace',
  [normalizeName('Digital Capitalism Research')]: 'digital-research',
  [normalizeName('WorkingNotes')]: 'working-notes',
};

const PROJECT_TARGET_BOARD: Record<string, string> = {
  'digital-research': 'Digital Capitalism Research',
  'working-notes': 'WorkingNotes',
};

function projectAliases(project: ProjectRegistryEntry): string[] {
  return [
    project.project_id,
    project.name,
    repoTail(project.related_repo),
  ].filter(Boolean);
}

export function resolveBoardProject(
  boardName: string,
  projects: ProjectRegistryEntry[],
  preferredProjectId?: string | null
): ProjectRegistryEntry {
  const fallback =
    projects.find((project) => project.project_id === 'rook-workspace') || {
      project_id: 'rook-workspace',
      name: 'Rook Workspace',
      related_repo: 'MarcusGraetsch/rook-workspace',
      type: 'operations',
    };

  if (preferredProjectId) {
    const preferred = projects.find((project) => project.project_id === preferredProjectId);
    if (preferred) {
      return preferred;
    }
  }

  const normalizedBoard = normalizeName(boardName);
  const boardDefaultProjectId = BOARD_DEFAULT_PROJECT[normalizedBoard];
  if (boardDefaultProjectId) {
    const boardDefault = projects.find((project) => project.project_id === boardDefaultProjectId);
    if (boardDefault) {
      return boardDefault;
    }
  }

  const exact = projects.find((project) =>
    projectAliases(project).some((candidate) => normalizeName(candidate) === normalizedBoard)
  );
  if (exact) {
    return exact;
  }

  const contains = projects.find((project) =>
    projectAliases(project).some((candidate) => {
      const normalizedCandidate = normalizeName(candidate);
      return normalizedBoard.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedBoard);
    })
  );
  if (contains) {
    return contains;
  }

  return fallback;
}

export function inferTargetBoardNameFromProject(
  projectId: string | null | undefined,
  relatedRepo: string | null | undefined,
  title: string | null | undefined
): string | null {
  const normalizedProjectId = normalizeName(projectId || '');
  if (normalizedProjectId && PROJECT_TARGET_BOARD[normalizedProjectId]) {
    return PROJECT_TARGET_BOARD[normalizedProjectId];
  }

  const normalizedRepo = normalizeName(repoTail(relatedRepo));
  const normalizedTitle = normalizeName(title || '');

  if (normalizedRepo === normalizeName('digital-capitalism-research')) {
    return PROJECT_TARGET_BOARD['digital-research'];
  }

  if (
    normalizedRepo === normalizeName('working-notes')
    || normalizedTitle.startsWith(normalizeName('working notes'))
  ) {
    return PROJECT_TARGET_BOARD['working-notes'];
  }

  return null;
}
