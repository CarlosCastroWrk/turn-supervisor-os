import { createRoot } from 'react-dom/client';
import { BoardFirstShell } from './BoardFirstShell';
import type {
  BoardFirstActionProposal,
  BoardFirstAssignmentProposal,
  BoardFirstCaptureRequest,
} from './types';
import './preview.css';

declare global {
  interface Window {
    __wave1rEvents: {
      actions: BoardFirstActionProposal[];
      assignments: BoardFirstAssignmentProposal[];
      assistantDrafts: string[];
      capture: BoardFirstCaptureRequest[];
    };
  }
}

window.__wave1rEvents = {
  actions: [],
  assignments: [],
  assistantDrafts: [],
  capture: [],
};

createRoot(document.getElementById('root')!).render(
  <BoardFirstShell
    onActionProposal={(proposal) => window.__wave1rEvents.actions.push(proposal)}
    onAssignmentProposal={(proposal) => window.__wave1rEvents.assignments.push(proposal)}
    onAssistantSubmit={(draft) => window.__wave1rEvents.assistantDrafts.push(draft)}
    onCaptureRequest={(request) => window.__wave1rEvents.capture.push(request)}
  />,
);
