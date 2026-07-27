import { createRoot } from 'react-dom/client';
import { BoardFirstShell } from './BoardFirstShell';
import type {
  BoardFirstActionProposal,
  BoardFirstActivityItem,
  BoardFirstAssignmentProposal,
  BoardFirstCaptureRequest,
  BoardFirstHostNavigationRequest,
} from './types';
import './preview.css';

declare global {
  interface Window {
    __wave1rEvents: {
      actions: BoardFirstActionProposal[];
      assignments: BoardFirstAssignmentProposal[];
      assistantDrafts: string[];
      capture: BoardFirstCaptureRequest[];
      captureDialogCounts: number[];
      hostNavigation: BoardFirstHostNavigationRequest[];
    };
  }
}

window.__wave1rEvents = {
  actions: [],
  assignments: [],
  assistantDrafts: [],
  capture: [],
  captureDialogCounts: [],
  hostNavigation: [],
};

createRoot(document.getElementById('root')!).render(
  <BoardFirstShell
    onActionProposal={(proposal) => window.__wave1rEvents.actions.push(proposal)}
    onAssignmentProposal={(proposal) => window.__wave1rEvents.assignments.push(proposal)}
    onAssistantSubmit={(request) => window.__wave1rEvents.assistantDrafts.push(request.sourceText)}
    onCaptureRequest={(request) => {
      window.__wave1rEvents.capture.push(request);
      window.__wave1rEvents.captureDialogCounts.push(
        document.querySelectorAll('[role="dialog"]').length,
      );
      const receiptIndex = window.__wave1rEvents.capture.length;
      if (request.kind === 'photo-file') {
        return {
          accepted: false,
          message: 'Photo or File was not accepted. Nothing was handed off or saved.',
        };
      }
      if (request.kind === 'note') {
        const activityItem: BoardFirstActivityItem = {
          id: `preview-capture-note-${receiptIndex}`,
          kind: 'note',
          nonpersisted: true,
          recordedAt: `2026-07-26T16:30:${String(receiptIndex).padStart(2, '0')}.000Z`,
          sourceLabel: 'Preview Capture receipt · nonpersisted',
          synthetic: true,
          title: 'Accepted preview note receipt',
          wording: 'Capture returned this synthetic note item. No permanent save is claimed.',
          unitId: request.unitId,
          unitNumber: request.unitNumber,
          trade: request.trade,
          section: request.section,
        };
        return {
          accepted: true,
          receiptId: `preview-capture-${receiptIndex}`,
          message: 'Capture accepted the note request and returned a synthetic item.',
          activityItem,
        };
      }
      return {
        accepted: true,
        receiptId: `preview-capture-${receiptIndex}`,
        message: `Capture accepted the ${request.kind} handoff. No recording or permanent save is claimed.`,
      };
    }}
    onHostNavigate={(request) => {
      window.__wave1rEvents.hostNavigation.push(request);
      if (request.destination === 'sync') {
        return {
          accepted: false,
          message: 'Sync is unavailable in the standalone preview. No navigation occurred.',
        };
      }
      return {
        accepted: true,
        message: `${request.destination} navigation was accepted by the preview host.`,
      };
    }}
  />,
);
