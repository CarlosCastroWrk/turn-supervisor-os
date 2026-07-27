import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { LaunchAuthController } from './auth';
import {
  activateOnboarding,
  createOnboardingState,
  nextOnboardingQuestion,
  previousOnboardingQuestion,
  recoverOnboardingState,
  updateOnboardingAnswer,
  type OnboardingAnswerChange,
  type OnboardingState,
} from './onboarding';

export const useLaunchAuthController = (controller: LaunchAuthController) => {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    void controller.start();
    return () => controller.stop();
  }, [controller]);

  return state;
};

export interface OnboardingControllerHook {
  state: OnboardingState;
  error?: string;
  answer(change: OnboardingAnswerChange, now: string): void;
  next(now: string): void;
  back(now: string): void;
  activate(now: string): void;
  recover(candidate: unknown, now: string): void;
}

export const useOnboardingController = (
  initialState?: OnboardingState,
): OnboardingControllerHook => {
  const [snapshot, setSnapshot] = useState<{ state: OnboardingState; error?: string }>(() => ({
    state: initialState ?? createOnboardingState(new Date().toISOString()),
  }));

  const answer = useCallback((change: OnboardingAnswerChange, now: string) => {
    setSnapshot((current) => ({
      state: updateOnboardingAnswer(current.state, change, now),
    }));
  }, []);

  const next = useCallback((now: string) => {
    setSnapshot((current) => {
      const transition = nextOnboardingQuestion(current.state, now);
      return { state: transition.state, error: transition.error };
    });
  }, []);

  const back = useCallback((now: string) => {
    setSnapshot((current) => ({
      state: previousOnboardingQuestion(current.state, now).state,
    }));
  }, []);

  const activate = useCallback((now: string) => {
    setSnapshot((current) => {
      const transition = activateOnboarding(current.state, now);
      return { state: transition.state, error: transition.error };
    });
  }, []);

  const recover = useCallback((candidate: unknown, now: string) => {
    const recovery = recoverOnboardingState(candidate, now);
    setSnapshot({ state: recovery.state, error: recovery.warnings[0] });
  }, []);

  return {
    state: snapshot.state,
    error: snapshot.error,
    answer,
    next,
    back,
    activate,
    recover,
  };
};
