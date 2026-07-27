import {
  DAILY_GOAL_MILESTONES,
  DAILY_GOAL_METRICS,
  validateDailyGoal,
  type DailyGoalConfiguration,
} from './goals';
import {
  LAUNCH_SETUP_TRADES,
  type CrewConfiguration,
  type DataPhotoPermissionSettings,
  type OfficialFormsConfiguration,
  type PersonalPropertyConfiguration,
  type PersonalPropertyIdentity,
  type PropertyContactsConfiguration,
  type ReviewActivationAcknowledgement,
  type TradeSelection,
  type TurnDateRange,
  type UnitImportPreference,
  type UnitTypesSectionsConfiguration,
  type WalkthroughConfiguration,
  type WorkHoursConfiguration,
} from './personalConfig';

export const ONBOARDING_QUESTIONS = [
  { id: 'property', title: 'Property', prompt: 'Which property is this personal setup for?' },
  { id: 'dates', title: 'Dates', prompt: 'What are the field dates for this Turn?' },
  { id: 'trades', title: 'Trades', prompt: 'Which supported trades will you personally track?' },
  { id: 'property-contacts', title: 'Property contacts', prompt: 'Who are your confirmed property contacts?' },
  { id: 'work-hours', title: 'Work hours', prompt: 'What work windows have been confirmed?' },
  { id: 'walkthrough-time', title: 'Walkthrough time', prompt: 'When is the recurring management walkthrough?' },
  { id: 'unit-import', title: 'Unit import', prompt: 'How will you add the initial Unit list?' },
  { id: 'unit-types-sections', title: 'Unit types and sections', prompt: 'Which Unit templates and section labels apply?' },
  { id: 'crews', title: 'Crews', prompt: 'Which crew references belong in this personal setup?' },
  { id: 'data-photo-permissions', title: 'Data and photo permissions', prompt: 'What storage permissions have been reviewed?' },
  { id: 'official-forms', title: 'Official forms', prompt: 'Which approved official references are available?' },
  { id: 'daily-goal', title: 'Daily goal', prompt: 'What deterministic daily goal should Home show?' },
  { id: 'review-activate', title: 'Review and activate', prompt: 'Confirm the personal-app safety boundaries.' },
] as const;

export type OnboardingQuestionId = (typeof ONBOARDING_QUESTIONS)[number]['id'];

export interface OnboardingAnswerMap {
  property: PersonalPropertyIdentity;
  dates: TurnDateRange;
  trades: TradeSelection;
  'property-contacts': PropertyContactsConfiguration;
  'work-hours': WorkHoursConfiguration;
  'walkthrough-time': WalkthroughConfiguration;
  'unit-import': UnitImportPreference;
  'unit-types-sections': UnitTypesSectionsConfiguration;
  crews: CrewConfiguration;
  'data-photo-permissions': DataPhotoPermissionSettings;
  'official-forms': OfficialFormsConfiguration;
  'daily-goal': DailyGoalConfiguration;
  'review-activate': ReviewActivationAcknowledgement;
}

export type OnboardingAnswers = Partial<OnboardingAnswerMap>;

export type OnboardingAnswerChange = {
  [Question in OnboardingQuestionId]: {
    questionId: Question;
    answer: OnboardingAnswerMap[Question];
  };
}[OnboardingQuestionId];

export interface OnboardingState {
  version: 1;
  status: 'draft' | 'active';
  currentQuestionId: OnboardingQuestionId;
  answers: OnboardingAnswers;
  updatedAt: string;
  activatedAt?: string;
}

export interface OnboardingValidation {
  valid: boolean;
  errors: string[];
}

export interface OnboardingTransition {
  state: OnboardingState;
  changed: boolean;
  error?: string;
}

export interface OnboardingRecovery {
  state: OnboardingState;
  recovered: boolean;
  warnings: string[];
}

export type PersonalConfigurationResult =
  | { ok: true; configuration: PersonalPropertyConfiguration }
  | { ok: false; errors: string[] };

const questionIds = ONBOARDING_QUESTIONS.map(({ id }) => id);
const questionIndex = new Map(questionIds.map((id, index) => [id, index]));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown, maxLength = 160): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const optionalShortText = (value: unknown) => value === undefined || (typeof value === 'string' && value.length <= 240);

const validIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const validTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);

const uniqueStrings = (values: readonly string[]) => new Set(values).size === values.length;

const validTrades = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((trade) => LAUNCH_SETUP_TRADES.includes(trade)) &&
  uniqueStrings(value);

const validateQuestionAnswerUnknown = (
  questionId: OnboardingQuestionId,
  answer: unknown,
): OnboardingValidation => {
  const errors: string[] = [];
  if (!isRecord(answer)) return { valid: false, errors: [`${questionId} answer is missing or malformed.`] };

  switch (questionId) {
    case 'property':
      if (!nonEmpty(answer.propertyName, 120)) errors.push('Property name is required.');
      if (!optionalShortText(answer.locationLabel)) errors.push('Location label is too long.');
      break;
    case 'dates':
      if (!validIsoDate(answer.startDate) || !validIsoDate(answer.endDate)) {
        errors.push('Start and end dates must be real YYYY-MM-DD dates.');
      } else if (answer.endDate < answer.startDate) {
        errors.push('End date cannot be before start date.');
      }
      break;
    case 'trades':
      if (!validTrades(answer.trades)) errors.push('Choose at least one unique supported trade.');
      break;
    case 'property-contacts': {
      if (!Array.isArray(answer.contacts) || typeof answer.needsConfirmation !== 'boolean') {
        errors.push('Property contacts answer is malformed.');
        break;
      }
      const contactsValid = answer.contacts.every(
        (contact) =>
          isRecord(contact) &&
          nonEmpty(contact.id, 120) &&
          nonEmpty(contact.displayName, 120) &&
          nonEmpty(contact.roleLabel, 120),
      );
      if (!contactsValid) errors.push('Every contact needs an ID, display name, and role.');
      if (answer.contacts.length === 0 && !answer.needsConfirmation) {
        errors.push('Record a contact or mark contacts as needing confirmation.');
      }
      break;
    }
    case 'work-hours': {
      if (!Array.isArray(answer.windows) || typeof answer.needsConfirmation !== 'boolean') {
        errors.push('Work-hours answer is malformed.');
        break;
      }
      const windowsValid = answer.windows.every(
        (window) =>
          isRecord(window) &&
          nonEmpty(window.id, 120) &&
          nonEmpty(window.label, 120) &&
          validTime(window.startTimeLocal) &&
          validTime(window.endTimeLocal) &&
          window.startTimeLocal < window.endTimeLocal,
      );
      if (!windowsValid) errors.push('Every work window needs valid local start and end times.');
      if (answer.windows.length === 0 && !answer.needsConfirmation) {
        errors.push('Record a work window or mark work hours as needing confirmation.');
      }
      break;
    }
    case 'walkthrough-time':
      if (typeof answer.needsConfirmation !== 'boolean') errors.push('Walkthrough confirmation state is required.');
      if (answer.localTime !== undefined && !validTime(answer.localTime)) errors.push('Walkthrough time is invalid.');
      if (!optionalShortText(answer.contactLabel)) errors.push('Walkthrough contact label is too long.');
      if (!answer.localTime && !answer.needsConfirmation) {
        errors.push('Record a walkthrough time or mark it as needing confirmation.');
      }
      break;
    case 'unit-import':
      if (!['later', 'manual', 'file', 'photo'].includes(String(answer.method))) {
        errors.push('Choose a supported Unit import method.');
      }
      if (answer.preserveOriginalSource !== true) errors.push('Original source preservation is required.');
      break;
    case 'unit-types-sections': {
      if (!Array.isArray(answer.templates) || typeof answer.needsConfirmation !== 'boolean') {
        errors.push('Unit template answer is malformed.');
        break;
      }
      const templatesValid = answer.templates.every(
        (template) =>
          isRecord(template) &&
          nonEmpty(template.id, 120) &&
          nonEmpty(template.label, 120) &&
          Array.isArray(template.sectionLabels) &&
          template.sectionLabels.length > 0 &&
          template.sectionLabels.every((section) => nonEmpty(section, 40)) &&
          uniqueStrings(template.sectionLabels),
      );
      if (!templatesValid) errors.push('Every Unit template needs unique nonempty section labels.');
      if (answer.templates.length === 0 && !answer.needsConfirmation) {
        errors.push('Record a Unit template or mark templates as needing confirmation.');
      }
      break;
    }
    case 'crews': {
      if (!Array.isArray(answer.crews) || typeof answer.needsConfirmation !== 'boolean') {
        errors.push('Crew answer is malformed.');
        break;
      }
      const crewsValid = answer.crews.every(
        (crew) =>
          isRecord(crew) &&
          nonEmpty(crew.id, 120) &&
          nonEmpty(crew.displayName, 120) &&
          validTrades(crew.trades),
      );
      if (!crewsValid) errors.push('Every crew needs an ID, display name, and supported trade.');
      if (answer.crews.length === 0 && !answer.needsConfirmation) {
        errors.push('Record a crew or mark crews as needing confirmation.');
      }
      break;
    }
    case 'data-photo-permissions': {
      const decisions = ['not-reviewed', 'disallowed', 'allowed'];
      if (!decisions.includes(String(answer.assignmentSourceStorage))) errors.push('Assignment-source permission is invalid.');
      if (!decisions.includes(String(answer.workPhotoStorage))) errors.push('Work-photo permission is invalid.');
      if (!decisions.includes(String(answer.personalCloudSync))) errors.push('Personal-sync permission is invalid.');
      if (!isRecord(answer.protectedData)) {
        errors.push('Protected-data rules are required.');
      } else if (
        answer.protectedData.tenantData !== 'prohibited' ||
        answer.protectedData.signatures !== 'prohibited' ||
        answer.protectedData.w9AndPaycardData !== 'prohibited' ||
        answer.protectedData.accessCredentials !== 'prohibited'
      ) {
        errors.push('Protected data must remain prohibited.');
      }
      if (!optionalShortText(answer.evidenceLabel)) errors.push('Permission evidence label is too long.');
      break;
    }
    case 'official-forms':
      if (!['not-configured', 'references-recorded'].includes(String(answer.status))) {
        errors.push('Official-form status is invalid.');
      }
      if (!Array.isArray(answer.referenceLabels) || !answer.referenceLabels.every((label) => nonEmpty(label, 160))) {
        errors.push('Official-form reference labels are malformed.');
      } else if (answer.status === 'references-recorded' && answer.referenceLabels.length === 0) {
        errors.push('Recorded official forms need at least one reference label.');
      }
      if (answer.automaticSubmission !== false) errors.push('Automatic form submission must remain off.');
      break;
    case 'daily-goal': {
      const goal = answer as unknown as DailyGoalConfiguration;
      const validation = validateDailyGoal(goal);
      errors.push(...validation.errors);
      if (!DAILY_GOAL_METRICS.includes(goal.metric)) errors.push('Daily-goal metric is invalid.');
      if (!DAILY_GOAL_MILESTONES.includes(goal.milestone)) errors.push('Daily-goal milestone is invalid.');
      break;
    }
    case 'review-activate':
      if (
        answer.personalAppOnly !== true ||
        answer.paperRemainsAuthoritative !== true ||
        answer.noAutomaticOperationalMutation !== true
      ) {
        errors.push('All personal-app safety acknowledgements are required.');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
};

export const validateOnboardingAnswer = <Question extends OnboardingQuestionId>(
  questionId: Question,
  answer: OnboardingAnswerMap[Question] | undefined,
): OnboardingValidation => validateQuestionAnswerUnknown(questionId, answer);

export const createOnboardingState = (now: string): OnboardingState => ({
  version: 1,
  status: 'draft',
  currentQuestionId: 'property',
  answers: {},
  updatedAt: now,
});

export const updateOnboardingAnswer = (
  state: OnboardingState,
  change: OnboardingAnswerChange,
  now: string,
): OnboardingState => ({
  ...state,
  status: 'draft',
  activatedAt: undefined,
  answers: { ...state.answers, [change.questionId]: change.answer },
  updatedAt: now,
});

const currentIndex = (state: OnboardingState) => questionIndex.get(state.currentQuestionId) ?? 0;

export const nextOnboardingQuestion = (state: OnboardingState, now: string): OnboardingTransition => {
  const validation = validateQuestionAnswerUnknown(
    state.currentQuestionId,
    state.answers[state.currentQuestionId],
  );
  if (!validation.valid) {
    return { state, changed: false, error: validation.errors[0] };
  }
  const index = currentIndex(state);
  if (index >= questionIds.length - 1) {
    return { state, changed: false, error: 'Review the safety acknowledgements, then activate setup.' };
  }
  return {
    state: { ...state, currentQuestionId: questionIds[index + 1], updatedAt: now },
    changed: true,
  };
};

export const previousOnboardingQuestion = (state: OnboardingState, now: string): OnboardingTransition => {
  const index = currentIndex(state);
  if (index === 0) return { state, changed: false };
  return {
    state: { ...state, status: 'draft', currentQuestionId: questionIds[index - 1], activatedAt: undefined, updatedAt: now },
    changed: true,
  };
};

const firstIncompleteIndex = (answers: OnboardingAnswers) => {
  const index = questionIds.findIndex(
    (questionId) => !validateQuestionAnswerUnknown(questionId, answers[questionId]).valid,
  );
  return index === -1 ? questionIds.length - 1 : index;
};

export const goToOnboardingQuestion = (
  state: OnboardingState,
  questionId: OnboardingQuestionId,
  now: string,
): OnboardingTransition => {
  const targetIndex = questionIndex.get(questionId);
  if (targetIndex === undefined) return { state, changed: false, error: 'Unknown onboarding question.' };
  if (targetIndex > firstIncompleteIndex(state.answers)) {
    return { state, changed: false, error: 'Complete earlier setup questions before jumping ahead.' };
  }
  return {
    state: { ...state, status: 'draft', currentQuestionId: questionId, activatedAt: undefined, updatedAt: now },
    changed: state.currentQuestionId !== questionId,
  };
};

export const validateCompleteOnboarding = (state: OnboardingState): OnboardingValidation => {
  const errors = questionIds.flatMap((questionId) => {
    const validation = validateQuestionAnswerUnknown(questionId, state.answers[questionId]);
    return validation.errors.map((error) => `${questionId}: ${error}`);
  });
  return { valid: errors.length === 0, errors };
};

export const activateOnboarding = (state: OnboardingState, now: string): OnboardingTransition => {
  const validation = validateCompleteOnboarding(state);
  if (!validation.valid) return { state, changed: false, error: validation.errors[0] };
  if (state.currentQuestionId !== 'review-activate') {
    return { state, changed: false, error: 'Open Review and activate before activating setup.' };
  }
  return {
    state: { ...state, status: 'active', activatedAt: now, updatedAt: now },
    changed: true,
  };
};

export const completedOnboardingQuestions = (state: OnboardingState) =>
  questionIds.filter((questionId) =>
    validateQuestionAnswerUnknown(questionId, state.answers[questionId]).valid,
  );

export const serializeOnboardingState = (state: OnboardingState) => JSON.stringify(state);

export const recoverOnboardingState = (candidate: unknown, now: string): OnboardingRecovery => {
  const warnings: string[] = [];
  let parsed = candidate;
  if (typeof candidate === 'string') {
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      return { state: createOnboardingState(now), recovered: false, warnings: ['Saved onboarding draft was not valid JSON.'] };
    }
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.answers)) {
    return { state: createOnboardingState(now), recovered: false, warnings: ['Saved onboarding draft was incompatible.'] };
  }

  const answers: OnboardingAnswers = {};
  for (const questionId of questionIds) {
    const answer = parsed.answers[questionId];
    if (answer === undefined) continue;
    if (validateQuestionAnswerUnknown(questionId, answer).valid) {
      Object.assign(answers, { [questionId]: answer });
    } else {
      warnings.push(`Dropped invalid saved answer for ${questionId}.`);
    }
  }

  const requestedQuestion = questionIds.includes(parsed.currentQuestionId as OnboardingQuestionId)
    ? (parsed.currentQuestionId as OnboardingQuestionId)
    : questionIds[firstIncompleteIndex(answers)];
  const requestedIndex = questionIndex.get(requestedQuestion) ?? 0;
  const accessibleIndex = Math.min(requestedIndex, firstIncompleteIndex(answers));
  const provisional: OnboardingState = {
    version: 1,
    status: 'draft',
    currentQuestionId: questionIds[accessibleIndex],
    answers,
    updatedAt: now,
  };
  const complete = validateCompleteOnboarding(provisional).valid;
  if (parsed.status === 'active' && complete) {
    provisional.status = 'active';
    provisional.currentQuestionId = 'review-activate';
    provisional.activatedAt = typeof parsed.activatedAt === 'string' ? parsed.activatedAt : now;
  }
  return { state: provisional, recovered: true, warnings };
};

export const buildPersonalPropertyConfiguration = (
  state: OnboardingState,
): PersonalConfigurationResult => {
  const validation = validateCompleteOnboarding(state);
  if (state.status !== 'active') validation.errors.unshift('Onboarding must be activated first.');
  if (validation.errors.length > 0) return { ok: false, errors: validation.errors };

  const answers = state.answers as OnboardingAnswerMap;
  return {
    ok: true,
    configuration: {
      source: 'personal-launch-setup',
      property: answers.property,
      dates: answers.dates,
      trades: answers.trades,
      contacts: answers['property-contacts'],
      workHours: answers['work-hours'],
      walkthrough: answers['walkthrough-time'],
      unitImport: answers['unit-import'],
      unitTypesAndSections: answers['unit-types-sections'],
      crews: answers.crews,
      permissions: answers['data-photo-permissions'],
      officialForms: answers['official-forms'],
      dailyGoal: answers['daily-goal'],
      personalAppOnly: true,
      paperRemainsAuthoritative: true,
    },
  };
};
