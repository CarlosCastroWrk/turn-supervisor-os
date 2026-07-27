import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_QUESTIONS,
  activateOnboarding,
  buildPersonalPropertyConfiguration,
  createOnboardingState,
  nextOnboardingQuestion,
  recoverOnboardingState,
  serializeOnboardingState,
  updateOnboardingAnswer,
} from '../src/features/launch-setup/onboarding.ts';
import { createConservativePermissionSettings } from '../src/features/launch-setup/personalConfig.ts';

const answers = {
  property: { propertyName: 'Synthetic Tower', locationLabel: 'Austin test fixture' },
  dates: { startDate: '2026-08-01', endDate: '2026-08-15' },
  trades: { trades: ['paint', 'clean'] },
  'property-contacts': {
    contacts: [{ id: 'contact-1', displayName: 'Synthetic Manager', roleLabel: 'Property contact' }],
    needsConfirmation: false,
  },
  'work-hours': {
    windows: [{ id: 'window-1', label: 'Confirmed test window', startTimeLocal: '08:00', endTimeLocal: '17:00' }],
    needsConfirmation: false,
  },
  'walkthrough-time': { localTime: '12:00', contactLabel: 'Synthetic Manager', needsConfirmation: false },
  'unit-import': { method: 'later', preserveOriginalSource: true },
  'unit-types-sections': {
    templates: [{ id: 'type-4', label: 'Synthetic four-section', sectionLabels: ['Common', 'A', 'B', 'C'] }],
    needsConfirmation: false,
  },
  crews: {
    crews: [{ id: 'crew-1', displayName: 'Synthetic Paint Crew', trades: ['paint'] }],
    needsConfirmation: false,
  },
  'data-photo-permissions': createConservativePermissionSettings(),
  'official-forms': { status: 'not-configured', referenceLabels: [], automaticSubmission: false },
  'daily-goal': { date: '2026-08-01', metric: 'sections', milestone: 'los-inspected', target: 20 },
  'review-activate': {
    personalAppOnly: true,
    paperRemainsAuthoritative: true,
    noAutomaticOperationalMutation: true,
  },
};

test('onboarding advances through exactly the 13 locked one-question steps', () => {
  let state = createOnboardingState('2026-07-27T12:00:00.000Z');
  assert.equal(ONBOARDING_QUESTIONS.length, 13);

  for (const [index, question] of ONBOARDING_QUESTIONS.entries()) {
    assert.equal(state.currentQuestionId, question.id);
    state = updateOnboardingAnswer(
      state,
      { questionId: question.id, answer: answers[question.id] },
      `2026-07-27T12:${String(index).padStart(2, '0')}:00.000Z`,
    );
    if (index < ONBOARDING_QUESTIONS.length - 1) {
      const transition = nextOnboardingQuestion(state, `2026-07-27T13:${String(index).padStart(2, '0')}:00.000Z`);
      assert.equal(transition.changed, true, transition.error);
      state = transition.state;
    }
  }

  const activation = activateOnboarding(state, '2026-07-27T14:00:00.000Z');
  assert.equal(activation.changed, true, activation.error);
  assert.equal(activation.state.status, 'active');

  const built = buildPersonalPropertyConfiguration(activation.state);
  assert.equal(built.ok, true);
  assert.equal(built.configuration.personalAppOnly, true);
  assert.equal(built.configuration.paperRemainsAuthoritative, true);
  assert.equal(built.configuration.permissions.workPhotoStorage, 'not-reviewed');
});

test('onboarding blocks invalid dates and preserves the current question', () => {
  let state = createOnboardingState('2026-07-27T12:00:00.000Z');
  state = updateOnboardingAnswer(state, { questionId: 'property', answer: answers.property }, '2026-07-27T12:01:00.000Z');
  state = nextOnboardingQuestion(state, '2026-07-27T12:02:00.000Z').state;
  state = updateOnboardingAnswer(
    state,
    { questionId: 'dates', answer: { startDate: '2026-08-15', endDate: '2026-08-01' } },
    '2026-07-27T12:03:00.000Z',
  );
  const transition = nextOnboardingQuestion(state, '2026-07-27T12:04:00.000Z');
  assert.equal(transition.changed, false);
  assert.equal(transition.state.currentQuestionId, 'dates');
  assert.match(transition.error, /End date cannot be before start date/u);
});

test('onboarding recovery keeps valid answers and drops malformed later answers', () => {
  let state = createOnboardingState('2026-07-27T12:00:00.000Z');
  state = updateOnboardingAnswer(state, { questionId: 'property', answer: answers.property }, '2026-07-27T12:01:00.000Z');
  state = nextOnboardingQuestion(state, '2026-07-27T12:02:00.000Z').state;
  state = updateOnboardingAnswer(state, { questionId: 'dates', answer: answers.dates }, '2026-07-27T12:03:00.000Z');
  state = nextOnboardingQuestion(state, '2026-07-27T12:04:00.000Z').state;

  const raw = JSON.parse(serializeOnboardingState(state));
  raw.answers.trades = { trades: ['unsupported-trade'] };
  raw.currentQuestionId = 'review-activate';
  const recovery = recoverOnboardingState(JSON.stringify(raw), '2026-07-27T15:00:00.000Z');

  assert.equal(recovery.recovered, true);
  assert.deepEqual(recovery.state.answers.property, answers.property);
  assert.deepEqual(recovery.state.answers.dates, answers.dates);
  assert.equal(recovery.state.answers.trades, undefined);
  assert.equal(recovery.state.currentQuestionId, 'trades');
  assert.match(recovery.warnings[0], /Dropped invalid saved answer for trades/u);
});
