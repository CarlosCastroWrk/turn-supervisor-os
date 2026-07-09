import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useToast } from '../components/toast-context';
import {
  undoUnitUpdate,
  updateUnitWithUndo,
  type ReversibleUnitPatch,
  type UnitUndoResult,
  type UnitUpdateWithUndoResult,
} from '../lib/actions';
import type { AppData, EntityId } from '../types';

export const useUndoableUnitUpdate = (setData: React.Dispatch<React.SetStateAction<AppData>>) => {
  const { notify } = useToast();

  return useCallback(
    (unitId: EntityId, patch: ReversibleUnitPatch, note: string, confirmation: string) => {
      let result: UnitUpdateWithUndoResult | undefined;
      flushSync(() => {
        setData((current) => {
          result = updateUnitWithUndo(current, unitId, patch, note);
          return result.data;
        });
      });

      const token = result?.undoToken;
      if (!token) {
        notify(
          result?.status === 'unchanged'
            ? 'That Unit already has this status. Nothing new was recorded.'
            : 'That Unit is no longer available. Refresh the board before trying again.',
          { tone: result?.status === 'unchanged' ? 'info' : 'error' },
        );
        return;
      }

      notify(confirmation, {
        tone: 'success',
        action: {
          label: 'Undo',
          onSelect: () => {
            let undoResult: UnitUndoResult | undefined;
            flushSync(() => {
              setData((current) => {
                undoResult = undoUnitUpdate(current, token);
                return undoResult.data;
              });
            });

            if (undoResult?.status === 'applied') {
              notify(`Unit ${token.unitNumber} restored to its previous status.`, { tone: 'success' });
              return;
            }

            notify(
              undoResult?.status === 'stale'
                ? `Unit ${token.unitNumber} changed again, so the earlier update was not undone.`
                : `Unit ${token.unitNumber} is no longer available to undo.`,
              { tone: 'error' },
            );
          },
        },
      });
    },
    [notify, setData],
  );
};
