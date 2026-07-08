import type {
  AppData,
  BriefingType,
  DraftAction,
  IssueCategory,
  IssuePriority,
  MemoryCandidate,
  Unit,
  WorkStatus,
} from '../../types';
import { buildDailyReport } from '../exporters';
import { createId, formatTime, nowISO, todayISO, tomorrowISO } from '../constants';
import {
  getActiveProject,
  getPriorityIssues,
  getProjectAssignments,
  getProjectIssues,
  getProjectUnits,
  getUnitSummary,
  isBlockedUnit,
  isInspectionUnit,
} from '../metrics';
import { generateSmartSuggestions } from './suggestions';
import { agentParseResultSchema, type AgentProvider, type AgentParseResult, type AskOsResult, type BriefingResult } from './types';

const sentenceSplit = (input: string) =>
  input
    .replace(/\s*,?\s+(?:and\s+then|then)\s+(?=(?:unit\s+)?\d{3,4}\b|[a-z]+(?:'s)?\s+crew\b)/gi, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const findUnitByNumber = (data: AppData, unitNumber: string) =>
  getProjectUnits(data).find((unit) => unit.unitNumber === unitNumber);

const extractUnitNumbers = (text: string, data: AppData) => {
  const prefixed = Array.from(text.matchAll(/\bunit\s*#?\s*(\d{3,4})\b/gi)).map((match) => match[1]);
  const bare = Array.from(text.matchAll(/\b(\d{3,4})\b/g))
    .map((match) => {
      const context = text.slice(Math.max(0, match.index - 42), match.index + match[0].length + 42).toLowerCase();
      return { context, unitNumber: match[1] };
    })
    .filter(
      ({ context, unitNumber }) =>
        Boolean(findUnitByNumber(data, unitNumber)) || /paint|clean|blocked|keys?|sink|leak|crew|moved|repair|unit/.test(context),
    )
    .map(({ unitNumber }) => unitNumber);
  return unique([...prefixed, ...bare]);
};
const extractBuildings = (text: string) => unique(Array.from(text.matchAll(/\bbuilding\s+([a-z0-9]+)/gi)).map((match) => `Building ${match[1].toUpperCase()}`));
const extractFloors = (text: string) => unique(Array.from(text.matchAll(/\bfloor\s+(\d+)/gi)).map((match) => `Floor ${match[1]}`));
const CREW_NAME_STOPWORDS = new Set(['the', 'a', 'an', 'my', 'our', 'his', 'her', 'their', 'this', 'that', 'whole', 'entire', 'other', 'new', 'one']);
const matchCrewName = (text: string) => {
  const match = Array.from(text.matchAll(/\b([a-z]+)(?:'s)?\s+crew\b/gi)).find(
    (item) => !CREW_NAME_STOPWORDS.has(item[1].toLowerCase()),
  );
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : undefined;
};
const extractCrewNames = (text: string) =>
  unique(
    Array.from(text.matchAll(/\b([a-z]+)(?:'s)?\s+crew\b/gi))
      .filter((item) => !CREW_NAME_STOPWORDS.has(item[1].toLowerCase()))
      .map((item) => `${item[1][0].toUpperCase()}${item[1].slice(1).toLowerCase()} crew`),
  );

const confidenceForUnit = (unit?: Unit) => (unit ? 0.9 : 0.58);

const makeDraft = (
  partial: Omit<DraftAction, 'id' | 'status' | 'createdAt'> & { id?: string; status?: DraftAction['status'] },
): DraftAction => ({
  id: partial.id ?? createId('draft'),
  status: partial.status ?? 'pending',
  createdAt: nowISO(),
  ...partial,
});

const makeMemoryCandidate = (
  partial: Omit<MemoryCandidate, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string },
): MemoryCandidate => {
  const now = nowISO();
  return {
    id: partial.id ?? createId('memory_candidate'),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
};

const issueFromText = (text: string): { category: IssueCategory; priority: IssuePriority; title: string } | null => {
  const lower = text.toLowerCase();
  if (/sink|leak|plumb|ac|cooling|broken|repair|maintenance/.test(lower)) {
    return { category: 'Maintenance', priority: /leak|ac|cooling/.test(lower) ? 'High' : 'Medium', title: 'Maintenance issue' };
  }
  if (/\bkeys?\b|\baccess\b|do not enter|occupied|tenant stuff|still inside/.test(lower)) {
    return {
      category: 'Access',
      priority: /do not enter|occupied|tenant stuff/.test(lower) ? 'Critical' : 'High',
      title: 'Access blocker',
    };
  }
  if (/cleaner|cleaning/.test(lower) && /blocked|waiting|behind|delayed/.test(lower)) {
    return { category: 'Cleaning', priority: 'High', title: 'Cleaning blocker' };
  }
  if (/paint|painter/.test(lower) && /blocked|waiting|behind|supplies|need/.test(lower)) {
    return { category: /supplies/.test(lower) ? 'Materials' : 'Paint', priority: 'Medium', title: 'Paint blocker' };
  }
  if (/safety|smoke|hazard/.test(lower)) {
    return { category: 'Safety', priority: 'Critical', title: 'Safety issue' };
  }
  return null;
};

const statusDraftsForUnit = (data: AppData, unitNumber: string, text: string, sourceText: string): DraftAction[] => {
  const lower = text.toLowerCase();
  const unit = findUnitByNumber(data, unitNumber);
  const drafts: DraftAction[] = [];
  const confidence = confidenceForUnit(unit);

  const addStatusDraft = (title: string, payload: Record<string, WorkStatus | string>, why: string, summary = title) => {
    drafts.push(
      makeDraft({
        type: 'UPDATE_UNIT_STATUS',
        title,
        summary,
        targetEntityType: 'unit',
        targetEntityId: unit?.id,
        payload: { unitNumber, ...payload },
        confidence,
        why: unit ? why : `${why} Unit ${unitNumber} is not in the current setup, so approval may fail until it is created.`,
        sourceText,
      }),
    );
  };

  if (/paint(?:ing)?\s+(?:done|complete|finished)|paint\s+complete/.test(lower)) {
    addStatusDraft(
      `Mark Unit ${unitNumber} paint complete`,
      { paintStatus: 'Complete', overallStatus: 'Cleaning Ready' },
      'The note says paint is done/complete.',
    );
  }

  if (/clean(?:ing|er)?\s+(?:done|complete|finished)|clean\s+complete/.test(lower)) {
    addStatusDraft(
      `Mark Unit ${unitNumber} clean complete`,
      { cleanStatus: 'Complete', inspectionStatus: 'Ready', overallStatus: 'Inspection Needed' },
      'The note says cleaning is complete, so inspection should be next.',
    );
  }

  if (/cleaner\s+(?:started|began)|cleaning\s+(?:started|in progress)/.test(lower)) {
    addStatusDraft(
      `Mark Unit ${unitNumber} cleaning in progress`,
      { cleanStatus: 'In Progress', overallStatus: 'Cleaning' },
      'The note says cleaner/cleaning started.',
    );
  }

  if (/maintenance|sink|leak|repair/.test(lower)) {
    addStatusDraft(
      `Mark Unit ${unitNumber} maintenance needed`,
      { repairStatus: 'Needed', overallStatus: 'Maintenance Needed' },
      'The note mentions maintenance/repair work.',
    );
  }

  if (/\bblocked\b|missing keys?|keys?\s+(?:are\s+|is\s+)?missing|\bno keys?\b|\bno access\b|do not enter|tenant stuff|still inside|locked out/.test(lower)) {
    addStatusDraft(
      `Mark Unit ${unitNumber} access or hold blocked`,
      { overallStatus: 'Access Blocked' },
      'The note describes blocked access or a hold condition.',
    );
  }

  return drafts;
};

const issueDraftForTarget = (data: AppData, unitNumber: string | undefined, text: string, sourceText: string): DraftAction | null => {
  const issue = issueFromText(text);
  if (!issue) {
    return null;
  }

  const unit = unitNumber ? findUnitByNumber(data, unitNumber) : undefined;
  const building = extractBuildings(text)[0];
  const floor = extractFloors(text)[0];
  const titleDetail = /sink|leak/i.test(text)
    ? 'sink leak'
    : /\bkeys?\b/i.test(text)
      ? 'missing keys'
      : /tenant stuff|do not enter/i.test(text)
        ? 'tenant belongings / do not enter'
        : /supplies/i.test(text)
          ? 'supplies needed'
          : issue.title.toLowerCase();

  const target = unitNumber ? `Unit ${unitNumber}` : [building, floor].filter(Boolean).join(' ') || 'Area';

  return makeDraft({
    type: 'CREATE_ISSUE',
    title: `${target}: ${titleDetail}`,
    summary: `Create ${issue.priority.toLowerCase()} ${issue.category.toLowerCase()} issue for ${target}.`,
    targetEntityType: unitNumber ? 'unit' : floor ? 'floor' : building ? 'building' : 'issue',
    targetEntityId: unit?.id,
    payload: {
      unitNumber,
      buildingName: building,
      floorName: floor,
      title: `${target}: ${titleDetail}`,
      category: issue.category,
      priority: issue.priority,
      status: 'Open',
      notes: text,
    },
    confidence: unitNumber ? confidenceForUnit(unit) : 0.66,
    why: unitNumber
      ? unit
        ? 'The note links a blocker/issue to an existing unit.'
        : `The note mentions Unit ${unitNumber}, but that unit is not in setup yet.`
      : 'The note describes a building/floor-level blocker.',
    sourceText,
  });
};

const followUpDraft = (text: string, sourceText: string): DraftAction | null => {
  const lower = text.toLowerCase();
  if (!/ask|follow up|verify|confirm/.test(lower)) {
    return null;
  }

  const owner = /tony/.test(lower) ? 'Tony' : /rey/.test(lower) ? 'Rey' : 'Los';
  return makeDraft({
    type: 'CREATE_FOLLOW_UP_TASK',
    title: text.replace(/[.?!]$/, ''),
    summary: `Create follow-up task for ${owner}.`,
    targetEntityType: 'followUpTask',
    payload: {
      title: text.replace(/[.?!]$/, ''),
      description: text,
      priority: /tomorrow|today|urgent|blocked/.test(lower) ? 'High' : 'Medium',
      owner,
      dueAt: /tomorrow/.test(lower) ? tomorrowISO() : '',
    },
    confidence: 0.82,
    why: 'The note explicitly asks to ask, verify, or follow up.',
    sourceText,
  });
};

const dailyLogDraft = (text: string, sourceText: string): DraftAction | null => {
  if (!/end of day|morning|midday|lesson|learned|biggest issue/i.test(text)) {
    return null;
  }

  return makeDraft({
    type: 'ADD_DAILY_LOG_ENTRY',
    title: 'Add note to daily log',
    summary: 'Append this field note to today’s daily log.',
    targetEntityType: 'dailyLog',
    payload: {
      date: todayISO(),
      section: /end of day/i.test(text) ? 'endOfDayReflection' : /morning/i.test(text) ? 'morningPlan' : 'middayUpdate',
      text,
    },
    confidence: 0.75,
    why: 'The note looks like a time-of-day field log or lesson.',
    sourceText,
  });
};

const assignmentDrafts = (data: AppData, text: string, sourceText: string): DraftAction[] => {
  const drafts: DraftAction[] = [];
  const matchedCrew = matchCrewName(text);
  const crewName = matchedCrew ? `${matchedCrew} crew` : undefined;
  const units = extractUnitNumbers(text, data);
  const lower = text.toLowerCase();

  if (crewName && /moved|started|finished|waiting/.test(lower)) {
    const targetUnit = /moved/.test(lower) ? units[units.length - 1] : units[0];
    drafts.push(
      makeDraft({
        type: 'CREATE_ASSIGNMENT',
        title: `${crewName} update${targetUnit ? ` for Unit ${targetUnit}` : ''}`,
        summary: text,
        targetEntityType: 'crew',
        payload: {
          teamName: crewName,
          trade: /clean/i.test(text) ? 'Cleaner' : /maintenance|repair/i.test(text) ? 'Maintenance' : 'Painter',
          unitNumbers: targetUnit ? [targetUnit] : units,
          scope: text,
          status: /waiting|supplies|blocked/.test(lower) ? 'Delayed' : /finished|complete/.test(lower) ? 'Complete' : 'In Progress',
          date: todayISO(),
        },
        confidence: 0.72,
        why: 'The note describes crew movement, completion, or waiting status.',
        sourceText,
      }),
    );
  }

  if (crewName && /supplies/.test(lower)) {
    drafts.push(
      makeDraft({
        type: 'CREATE_ISSUE',
        title: `${crewName} waiting on supplies`,
        summary: 'Create materials issue for crew supplies.',
        targetEntityType: 'crew',
        payload: {
          title: `${crewName} waiting on supplies`,
          category: 'Materials',
          priority: 'Medium',
          status: 'Open',
          notes: text,
        },
        confidence: 0.78,
        why: 'Waiting on supplies is a field blocker worth tracking.',
        sourceText,
      }),
    );
  }

  return drafts;
};

const memoryCandidatesFromText = (text: string, sourceText: string): MemoryCandidate[] => {
  const lower = text.toLowerCase();
  const candidates: MemoryCandidate[] = [];

  if (/tony\s+(?:said|prefers|wants|likes)/i.test(text)) {
    candidates.push(
      makeMemoryCandidate({
        memoryType: /\bready\b/.test(lower) || lower.includes('inspection') ? 'Workflow Memory' : 'Role Memory',
        content: text.replace(/^.*?tony\s+said\s+/i, 'Tony said ').replace(/[.?!]$/, '.'),
        source: sourceText,
        confidence: 0.84,
      }),
    );
  }

  if (/ready.*inspection|inspection.*ready/i.test(text)) {
    candidates.push(
      makeMemoryCandidate({
        memoryType: 'Workflow Memory',
        content: 'Ready requires inspection to be complete.',
        source: sourceText,
        confidence: 0.9,
      }),
    );
  }

  if (/missing keys?|keys? should|access/i.test(text) && /categor/i.test(text)) {
    candidates.push(
      makeMemoryCandidate({
        memoryType: 'Workflow Memory',
        content: 'Missing keys should be categorized as Access.',
        source: sourceText,
        confidence: 0.78,
      }),
    );
  }

  if (/blocked units need|issues without owners|lesson|learned/i.test(text)) {
    candidates.push(
      makeMemoryCandidate({
        memoryType: 'Lesson Learned',
        content: text.replace(/[.?!]$/, '.'),
        source: sourceText,
        confidence: 0.74,
      }),
    );
  }

  const crewName = matchCrewName(text);
  if (crewName && /paint|clean|maintenance|flooring/.test(lower)) {
    const trade = lower.includes('clean') ? 'cleaning' : lower.includes('maintenance') ? 'maintenance' : lower.includes('floor') ? 'flooring' : 'painting';
    candidates.push(
      makeMemoryCandidate({
        memoryType: 'Crew Memory',
        content: `${crewName}'s crew handles ${trade}.`,
        source: sourceText,
        confidence: 0.7,
      }),
    );
  }

  return candidates;
};

const missingUnitFollowUps = (data: AppData, units: string[], sourceText: string): DraftAction[] =>
  units
    .filter((unitNumber) => !findUnitByNumber(data, unitNumber))
    .map((unitNumber) =>
      makeDraft({
        type: 'CREATE_FOLLOW_UP_TASK',
        title: `Confirm Unit ${unitNumber} exists in setup`,
        summary: `The note references Unit ${unitNumber}, but it is not in the local setup yet.`,
        targetEntityType: 'unit',
        payload: {
          title: `Confirm/create Unit ${unitNumber}`,
          description: `Quick Capture referenced Unit ${unitNumber}. Confirm whether to add it to setup.`,
          priority: 'Medium',
          owner: 'Los',
          relatedEntityType: 'unit',
        },
        confidence: 0.62,
        why: 'Copilot must not invent unit records as certain.',
        sourceText,
      }),
    );

const parseQuickCapture = async (input: string, data: AppData): Promise<AgentParseResult> => {
  const rawInput = input.trim();
  const units = extractUnitNumbers(rawInput, data);
  const buildings = extractBuildings(rawInput);
  const floors = extractFloors(rawInput);
  const crews = extractCrewNames(rawInput);
  const draftActions: DraftAction[] = [];
  const memoryCandidates: MemoryCandidate[] = [];
  const warnings: string[] = [];

  sentenceSplit(rawInput).forEach((sentence) => {
    const sentenceUnits = extractUnitNumbers(sentence, data);
    sentenceUnits.forEach((unitNumber) => {
      draftActions.push(...statusDraftsForUnit(data, unitNumber, sentence, rawInput));
      const issueDraft = issueDraftForTarget(data, unitNumber, sentence, rawInput);
      if (issueDraft) {
        draftActions.push(issueDraft);
      }
    });

    if (sentenceUnits.length === 0 && (extractBuildings(sentence).length > 0 || extractFloors(sentence).length > 0)) {
      const issueDraft = issueDraftForTarget(data, undefined, sentence, rawInput);
      if (issueDraft) {
        draftActions.push(issueDraft);
      }
    }

    const followUp = followUpDraft(sentence, rawInput);
    if (followUp) {
      draftActions.push(followUp);
    }

    const daily = dailyLogDraft(sentence, rawInput);
    if (daily) {
      draftActions.push(daily);
    }

    draftActions.push(...assignmentDrafts(data, sentence, rawInput));
    memoryCandidates.push(...memoryCandidatesFromText(sentence, rawInput));
  });

  draftActions.push(...missingUnitFollowUps(data, units, rawInput));

  const notFound = units.filter((unitNumber) => !findUnitByNumber(data, unitNumber));
  if (notFound.length > 0) {
    warnings.push(`Unit(s) not in setup yet: ${notFound.join(', ')}. Drafts stay review-only until you confirm setup.`);
  }

  if (!rawInput) {
    warnings.push('No note entered.');
  }

  if (draftActions.length === 0 && memoryCandidates.length === 0 && rawInput) {
    draftActions.push(
      makeDraft({
        type: 'ADD_DAILY_LOG_ENTRY',
        title: 'Save raw note to daily log',
        summary: rawInput,
        targetEntityType: 'dailyLog',
        payload: { date: todayISO(), section: 'middayUpdate', text: rawInput },
        confidence: 0.42,
        why: 'No specific structured action was detected, but the note may still be useful.',
        sourceText: rawInput,
      }),
    );
    warnings.push('No high-confidence structured action found. Saving as a raw note is safest.');
  }

  const result: AgentParseResult = {
    summary: rawInput ? `Found ${draftActions.length} draft action(s) and ${memoryCandidates.length} memory candidate(s).` : 'No input.',
    rawInput,
    detectedEntities: {
      units,
      buildings,
      floors,
      crews,
      issues: draftActions.filter((action) => action.type === 'CREATE_ISSUE').map((action) => action.title),
    },
    draftActions,
    memoryCandidates,
    clarificationQuestions: warnings.length > 0 ? ['Review low-confidence or missing-setup drafts before approving.'] : [],
    warnings,
    confidence: draftActions.length > 0 ? Math.min(0.92, draftActions.reduce((sum, action) => sum + action.confidence, 0) / draftActions.length) : 0.4,
  };

  return agentParseResultSchema.parse(result);
};

const answerAskOs = (question: string, data: AppData): AskOsResult => {
  const q = question.toLowerCase();
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data).filter((issue) => !['Closed', 'Resolved'].includes(issue.status));
  const assignments = getProjectAssignments(data);
  const summary = getUnitSummary(units);
  const suggestions = generateSmartSuggestions(data);
  const supportingRecords: string[] = [];
  const suggestedNextActions: string[] = [];
  const uncertainty: string[] = [];
  let conciseAnswer = 'I can answer from local app data only. Try asking about blocked units, inspections, stale units, crews, keys, or what to tell Tony.';

  if (/blocked/.test(q)) {
    const blocked = units.filter(isBlockedUnit);
    conciseAnswer = blocked.length ? `${blocked.length} unit(s) are blocked: ${blocked.map((unit) => unit.unitNumber).join(', ')}.` : 'No blocked units are currently recorded.';
    supportingRecords.push(...blocked.map((unit) => `Unit ${unit.unitNumber}: ${unit.overallStatus}, updated ${formatTime(unit.updatedAt)}`));
    suggestedNextActions.push('Confirm every blocked unit has an owner and follow-up time.');
  } else if (/inspection/.test(q)) {
    const inspection = units.filter(isInspectionUnit);
    conciseAnswer = inspection.length ? `${inspection.length} unit(s) need inspection: ${inspection.map((unit) => unit.unitNumber).join(', ')}.` : 'No units are currently marked as needing inspection.';
    supportingRecords.push(...inspection.map((unit) => `Unit ${unit.unitNumber}: inspection ${unit.inspectionStatus}`));
    suggestedNextActions.push('Walk inspection-ready units before marking anything Ready.');
  } else if (/not been updated|stale|3 hours|three hours/.test(q)) {
    const stale = units.filter((unit) => Date.now() - new Date(unit.updatedAt).getTime() >= 3 * 3_600_000);
    conciseAnswer = stale.length ? `${stale.length} unit(s) look stale: ${stale.map((unit) => unit.unitNumber).join(', ')}.` : 'No units are older than 3 hours based on local timestamps.';
    supportingRecords.push(...stale.slice(0, 8).map((unit) => `Unit ${unit.unitNumber}: last updated ${formatTime(unit.updatedAt)}`));
    suggestedNextActions.push('Re-walk the oldest active unit first.');
  } else if (/highest|priority|critical/.test(q)) {
    const priority = getPriorityIssues(issues).slice(0, 6);
    conciseAnswer = priority.length ? `Top issue: ${priority[0].title}. ${priority.length} priority issue(s) are open.` : 'No open priority issues recorded.';
    supportingRecords.push(...priority.map((issue) => `${issue.priority}: ${issue.title} (${issue.status})`));
    suggestedNextActions.push('Assign owners to high/critical issues without owners.');
  } else if (/check next|walk path|attention/.test(q)) {
    conciseAnswer = suggestions.length ? `Check next: ${suggestions[0].title}.` : 'No urgent deterministic suggestion is active.';
    supportingRecords.push(...suggestions.slice(0, 5).map((suggestion) => `${suggestion.priority}: ${suggestion.title}`));
    suggestedNextActions.push('Start with critical issues, then blocked units, then inspection-ready units.');
  } else if (/crew|assigned|where/.test(q)) {
    const todayAssignments = assignments.filter((assignment) => assignment.date === todayISO());
    conciseAnswer = todayAssignments.length ? `${todayAssignments.length} assignment(s) are scheduled today.` : 'No assignments scheduled for today.';
    supportingRecords.push(
      ...todayAssignments.map((assignment) => `${assignment.teamName}: ${assignment.status} - ${assignment.scope || 'No scope noted'}`),
    );
    suggestedNextActions.push('Check delayed/no-show assignments first.');
  } else if (/key|keys|access/.test(q)) {
    const keyIssues = issues.filter((issue) => ['Access', 'Keys'].includes(issue.category) || /key|access/i.test(`${issue.title} ${issue.notes}`));
    conciseAnswer = keyIssues.length ? `${keyIssues.length} open issue(s) involve keys/access.` : 'No open key/access issues recorded.';
    supportingRecords.push(...keyIssues.map((issue) => `${issue.priority}: ${issue.title} (${issue.status})`));
    suggestedNextActions.push('Batch key/access blockers into one concise update for Tony or property staff.');
  } else if (/waiting on cleaners|cleaners|cleaning/.test(q)) {
    const waiting = units.filter((unit) => ['Ready', 'Blocked', 'Not Started'].includes(unit.cleanStatus) && unit.overallStatus !== 'Ready');
    conciseAnswer = waiting.length ? `${waiting.length} unit(s) may be waiting on cleaning or cleaner confirmation.` : 'No units are clearly waiting on cleaners from current statuses.';
    supportingRecords.push(...waiting.slice(0, 8).map((unit) => `Unit ${unit.unitNumber}: clean ${unit.cleanStatus}, overall ${unit.overallStatus}`));
    suggestedNextActions.push('Confirm cleaner coverage by floor.');
  } else if (/tell tony|message tony|update tony/.test(q)) {
    const priority = getPriorityIssues(issues).slice(0, 3);
    conciseAnswer = `Current status: ${summary.ready} ready, ${summary.inProgress} in progress, ${summary.blocked} blocked, ${summary.inspection} need inspection.`;
    supportingRecords.push(...priority.map((issue) => `${issue.priority}: ${issue.title}`));
    suggestedNextActions.push(
      `Suggested message: Tony, current status: ${summary.ready} ready, ${summary.inProgress} in progress, ${summary.blocked} blocked, ${summary.inspection} need inspection. Biggest blockers: ${
        priority.map((issue) => issue.title).join('; ') || 'none recorded yet'
      }.`,
    );
  } else if (/learn|lesson/.test(q)) {
    const lessons = data.dailyLogs.map((log) => log.lessons).filter(Boolean);
    conciseAnswer = lessons.length ? `Recent lesson: ${lessons[0]}` : 'Not enough lessons recorded yet.';
    supportingRecords.push(...lessons.slice(0, 5));
    suggestedNextActions.push('Add one lesson in the Daily Log before end of day.');
  } else if (/training|questions/.test(q)) {
    const openQuestions = data.trainingQuestions.filter((item) => item.status !== 'Answered').slice(0, 8);
    conciseAnswer = openQuestions.length ? `${openQuestions.length} training question(s) still need attention in the first page of results.` : 'All tracked training questions are answered.';
    supportingRecords.push(...openQuestions.map((item) => `${item.status}: ${item.question}`));
    suggestedNextActions.push('Ask the highest-impact role/workflow questions first.');
  }

  if (units.length === 0) {
    uncertainty.push('No units are set up yet.');
  }
  if (issues.length === 0) {
    uncertainty.push('No open issues are recorded yet.');
  }

  return { question, conciseAnswer, supportingRecords, uncertainty, suggestedNextActions, createdAt: nowISO() };
};

const generateBriefing = async (type: BriefingType, data: AppData): Promise<BriefingResult> => {
  const project = getActiveProject(data);
  const units = getProjectUnits(data);
  const summary = getUnitSummary(units);
  const issues = getPriorityIssues(getProjectIssues(data).filter((issue) => !['Closed', 'Resolved'].includes(issue.status)));
  const assignments = getProjectAssignments(data).filter((assignment) => assignment.date === todayISO());
  const suggestions = generateSmartSuggestions(data);
  const todayLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === todayISO());
  const conciseMemory = data.memories.some((memory) => memory.approved && /concise|tony/i.test(memory.content));
  const records = [
    `${summary.totalUnits} units, ${summary.ready} ready, ${summary.inProgress} in progress, ${summary.blocked} blocked`,
    ...issues.slice(0, 5).map((issue) => `${issue.priority}: ${issue.title}`),
    ...assignments.slice(0, 4).map((assignment) => `${assignment.teamName}: ${assignment.status}`),
  ];

  const shortVersion = `Short version: ${summary.ready}/${summary.totalUnits} ready, ${summary.inProgress} in progress, ${summary.blocked} blocked, ${summary.inspection} need inspection. Biggest issue: ${
    issues[0]?.title ?? 'not enough issue data recorded yet'
  }.`;

  const bodies: Record<BriefingType, string> = {
    morning: `${conciseMemory ? `${shortVersion}\n\n` : ''}Morning Brief

Today's priorities:
${todayLog?.morningPlan || todayLog?.tomorrowPriorities || 'Not enough data recorded yet.'}

Open blockers from yesterday / current board:
${issues.slice(0, 6).map((issue) => `- ${issue.title} (${issue.priority}, ${issue.status})`).join('\n') || '- No open blockers recorded.'}

Crews expected:
${assignments.map((assignment) => `- ${assignment.teamName}: ${assignment.scope || assignment.status}`).join('\n') || '- No assignments recorded for today.'}

Risk areas:
${suggestions.slice(0, 5).map((suggestion) => `- ${suggestion.title}`).join('\n') || '- No deterministic risks detected.'}`,
    midday: `${conciseMemory ? `${shortVersion}\n\n` : ''}Midday Brief

Progress so far:
- Ready: ${summary.ready}
- In progress: ${summary.inProgress}
- Blocked: ${summary.blocked}
- Needs inspection: ${summary.inspection}

Open issues:
${issues.slice(0, 8).map((issue) => `- ${issue.title} (${issue.priority})`).join('\n') || '- No open issues recorded.'}

Crews not checked in / delayed:
${assignments.filter((assignment) => !['Checked In', 'In Progress', 'Complete'].includes(assignment.status)).map((assignment) => `- ${assignment.teamName}: ${assignment.status}`).join('\n') || '- No crew gaps recorded.'}

Suggested next walk path:
${suggestions.slice(0, 5).map((suggestion, index) => `${index + 1}. ${suggestion.title}`).join('\n') || '1. Re-walk active floors and update stale units.'}`,
    end_of_day: `${buildDailyReport(data, project, todayISO(), todayLog)}
Stale / smart suggestions:
${suggestions.slice(0, 6).map((suggestion) => `- ${suggestion.title}`).join('\n') || '- No deterministic suggestions active.'}

Suggested message to Tony:
${shortVersion}`,
  };

  return {
    type,
    title: type === 'morning' ? 'Morning Brief' : type === 'midday' ? 'Midday Brief' : 'End-of-Day Report',
    body: bodies[type],
    supportingRecords: records,
    suggestedNextActions: suggestions.slice(0, 4).map((suggestion) => suggestion.title),
    createdAt: nowISO(),
  };
};

export const mockAgentProvider: AgentProvider = {
  parseQuickCapture,
  async askOs(question, data) {
    return answerAskOs(question, data);
  },
  generateBriefing,
};
