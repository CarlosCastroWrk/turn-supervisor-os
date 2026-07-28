import type { ReactNode } from 'react';
import {
  TRACK_B_SETUP_QUESTIONS,
  type TrackBSetupQuestionId,
} from './model';
import { NativeDetailShell } from './NativeDetailShell';

export interface TrackBSetupQuestionnaireProps {
  children: ReactNode;
  currentQuestionId: TrackBSetupQuestionId;
  statusLabel: string;
  canContinue?: boolean;
  onBack: () => void;
  onContinue: () => void;
  onExit: () => void;
  onReview: () => void;
}
export function TrackBSetupQuestionnaire({
  canContinue = true,
  children,
  currentQuestionId,
  onBack,
  onContinue,
  onExit,
  onReview,
  statusLabel,
}: TrackBSetupQuestionnaireProps) {
  const index = TRACK_B_SETUP_QUESTIONS.findIndex(
    (question) => question.id === currentQuestionId,
  );
  const safeIndex = index >= 0 ? index : 0;
  const question = TRACK_B_SETUP_QUESTIONS[safeIndex];
  const isReview = question.id === 'review';
  const percentage = Math.round(
    ((safeIndex + 1) / TRACK_B_SETUP_QUESTIONS.length) * 100,
  );

  return (
    <NativeDetailShell
      backLabel="Exit setup"
      description="One confirmed answer at a time."
      onBack={onExit}
      statusLabel={statusLabel}
      title="Setup"
    >
      <section
        className="w2a1b-question"
        data-question-id={question.id}
        aria-labelledby={`w2a1b-question-${question.id}`}
      >
        <div className="w2a1b-question__progress-copy">
          <span>Question {safeIndex + 1} of {TRACK_B_SETUP_QUESTIONS.length}</span>
          <strong>{percentage}%</strong>
        </div>
        <progress
          aria-label={`Setup progress: question ${safeIndex + 1} of ${TRACK_B_SETUP_QUESTIONS.length}`}
          max={TRACK_B_SETUP_QUESTIONS.length}
          value={safeIndex + 1}
        />

        <div className="w2a1b-question__card">
          <p className="w2a1b-eyebrow">Personal project setup</p>
          <h2 id={`w2a1b-question-${question.id}`}>{question.title}</h2>
          <p>{question.prompt}</p>
          <div className="w2a1b-question__answer">{children}</div>
        </div>

        <p className="w2a1b-question__notice">
          Answers remain provisional until the host app confirms a reviewed save.
        </p>

        <div className="w2a1b-question__actions">
          <button
            className="w2a1b-secondary-button"
            disabled={safeIndex === 0}
            type="button"
            onClick={onBack}
          >
            Back
          </button>
          <button
            className="w2a1b-primary-button"
            disabled={!canContinue}
            type="button"
            onClick={isReview ? onReview : onContinue}
          >
            {isReview ? 'Finish review' : 'Continue'}
          </button>
        </div>
      </section>
    </NativeDetailShell>
  );
}
