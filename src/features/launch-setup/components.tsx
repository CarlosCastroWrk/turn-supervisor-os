import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { LaunchAuthState } from './auth';
import {
  DAILY_GOAL_MILESTONES,
  DAILY_GOAL_METRICS,
  validateDailyGoal,
  type DailyGoalConfiguration,
  type DailyGoalProgress,
} from './goals';
import type { LaunchSetupMotionPolicy } from './motion';
import {
  ONBOARDING_QUESTIONS,
  validateOnboardingAnswer,
  type OnboardingAnswerMap,
  type OnboardingQuestionId,
  type OnboardingState,
} from './onboarding';

const fieldControlStyle: CSSProperties = {
  fontSize: 16,
  minHeight: 44,
};

const actionControlStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
};

export interface LaunchAuthPanelProps {
  state: LaunchAuthState;
  brandSlot?: ReactNode;
  onSignIn(email: string, password: string): Promise<{ ok: boolean }>;
  onRequestPasswordReset(email: string): Promise<{ ok: boolean }>;
  onContinueOffline?(): void;
}

export function LaunchAuthPanel({
  state,
  brandSlot,
  onSignIn,
  onRequestPasswordReset,
  onContinueOffline,
}: LaunchAuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = state.operation !== 'idle';
  const online = state.connectivity === 'online';
  const configured = state.phase !== 'unconfigured';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await onSignIn(email, password);
    if (result.ok) setPassword('');
  };

  return (
    <section aria-labelledby="launch-auth-heading" data-auth-phase={state.phase}>
      {brandSlot}
      <h1 id="launch-auth-heading">Sign in to Turn OS</h1>
      <p role="status">{state.message}</p>
      {state.lastError ? <p role="alert">{state.lastError}</p> : null}

      <form onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            style={fieldControlStyle}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            style={fieldControlStyle}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy || !online || !configured} style={actionControlStyle} type="submit">
          {state.operation === 'signing-in' ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          disabled={busy || !online || !configured || !email.trim()}
          style={actionControlStyle}
          type="button"
          onClick={() => void onRequestPasswordReset(email)}
        >
          Forgot password
        </button>
      </form>

      {state.canUseLocalApp && state.cloudAccess === 'paused' && onContinueOffline ? (
        <button style={actionControlStyle} type="button" onClick={onContinueOffline}>
          Continue with saved field data
        </button>
      ) : null}
    </section>
  );
}

export interface OnboardingQuestionFrameProps<Question extends OnboardingQuestionId> {
  state: OnboardingState;
  questionId: Question;
  answer: OnboardingAnswerMap[Question] | undefined;
  children: ReactNode;
  motionPolicy: LaunchSetupMotionPolicy;
  error?: string;
  onBack(): void;
  onNext(): void;
  onActivate(): void;
}

export function OnboardingQuestionFrame<Question extends OnboardingQuestionId>({
  state,
  questionId,
  answer,
  children,
  motionPolicy,
  error,
  onBack,
  onNext,
  onActivate,
}: OnboardingQuestionFrameProps<Question>) {
  const index = ONBOARDING_QUESTIONS.findIndex((question) => question.id === questionId);
  const question = ONBOARDING_QUESTIONS[index];
  const validation = validateOnboardingAnswer(questionId, answer);
  const isReview = questionId === 'review-activate';

  return (
    <section
      aria-labelledby={`launch-onboarding-${questionId}`}
      data-motion={motionPolicy.questionTransition}
      data-question-id={questionId}
    >
      <p>
        Question {index + 1} of {ONBOARDING_QUESTIONS.length}
      </p>
      <h1 id={`launch-onboarding-${questionId}`}>{question.title}</h1>
      <p>{question.prompt}</p>
      <div>{children}</div>
      {error ? <p role="alert">{error}</p> : null}
      {!validation.valid && answer ? <p role="alert">{validation.errors[0]}</p> : null}
      <div>
        <button disabled={index === 0} style={actionControlStyle} type="button" onClick={onBack}>
          Back
        </button>
        {isReview ? (
          <button
            disabled={!validation.valid || state.status === 'active'}
            style={actionControlStyle}
            type="button"
            onClick={onActivate}
          >
            {state.status === 'active' ? 'Setup active' : 'Activate personal setup'}
          </button>
        ) : (
          <button disabled={!validation.valid} style={actionControlStyle} type="button" onClick={onNext}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}

const metricLabels = {
  units: 'Units',
  sections: 'Sections',
  inspections: 'Inspections',
} as const;

const milestoneLabels = {
  'crew-reported-complete': 'Crew reported complete',
  'los-inspected': 'Los inspected',
  'ready-to-walk': 'Ready to walk',
  'property-accepted': 'Property accepted',
} as const;

export interface DailyGoalEditorProps {
  goal: DailyGoalConfiguration;
  progress?: DailyGoalProgress;
  onChange(goal: DailyGoalConfiguration): void;
}

export function DailyGoalEditor({ goal, progress, onChange }: DailyGoalEditorProps) {
  const validation = validateDailyGoal(goal);
  return (
    <fieldset>
      <legend>Daily goal</legend>
      <label>
        Date
        <input
          style={fieldControlStyle}
          type="date"
          value={goal.date}
          onChange={(event) => onChange({ ...goal, date: event.target.value })}
        />
      </label>
      <label>
        Metric
        <select
          style={fieldControlStyle}
          value={goal.metric}
          onChange={(event) =>
            onChange({ ...goal, metric: event.target.value as DailyGoalConfiguration['metric'] })
          }
        >
          {DAILY_GOAL_METRICS.map((metric) => (
            <option key={metric} value={metric}>{metricLabels[metric]}</option>
          ))}
        </select>
      </label>
      <label>
        Milestone
        <select
          style={fieldControlStyle}
          value={goal.milestone}
          onChange={(event) =>
            onChange({ ...goal, milestone: event.target.value as DailyGoalConfiguration['milestone'] })
          }
        >
          {DAILY_GOAL_MILESTONES.map((milestone) => (
            <option key={milestone} value={milestone}>{milestoneLabels[milestone]}</option>
          ))}
        </select>
      </label>
      <label>
        Target
        <input
          inputMode="numeric"
          min={1}
          style={fieldControlStyle}
          type="number"
          value={goal.target}
          onChange={(event) => onChange({ ...goal, target: Number(event.target.value) })}
        />
      </label>
      {!validation.valid ? <p role="alert">{validation.errors[0]}</p> : null}
      {progress ? (
        <p aria-label={`Daily goal progress ${progress.percentage} percent`}>
          {progress.actual} of {progress.target} · {progress.percentage}%
        </p>
      ) : null}
    </fieldset>
  );
}
