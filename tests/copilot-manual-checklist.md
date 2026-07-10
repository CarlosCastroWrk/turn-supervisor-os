# Copilot Manual Test Checklist

Use this checklist before relying on Copilot during field work.

## Quick Capture Parsing

- [ ] Parse: `Unit 305 paint done, cleaner started at 11, bathroom sink leaking, need maintenance.`
- [ ] Parse: `Building B floor 2 is behind. Three rooms still need paint. Jose is waiting on supplies.`
- [ ] Parse: `Tony said don't mark units ready until inspection is complete.`
- [ ] Parse: `Maria crew finished 204 and 205, moved to 206.`
- [ ] Parse: `Ask the project manager tomorrow how extra work gets approved.`
- [ ] Parse: `Building A 101, 102, 103 all clean complete, need inspection.`
- [ ] Parse: `Unit 212 blocked because tenant stuff still inside. Do not enter yet.`
- [ ] Parse: `End of day: 18 complete, 7 blocked, biggest issue is keys and maintenance.`

## Draft Actions

- [ ] Draft actions appear before data changes.
- [ ] Approving a unit update changes the unit status.
- [ ] Rejecting a draft leaves app data unchanged.
- [ ] Editing draft payload JSON changes what is applied.
- [ ] Missing-unit drafts fail safely or create follow-up tasks.
- [ ] Ready-state draft fails unless inspection and required statuses are complete.

## Memory

- [ ] Workflow memory candidate appears for Tony/inspection rule.
- [ ] Approving memory adds it to Approved Memory.
- [ ] Rejecting memory keeps it out of active memory.
- [ ] Editing memory content persists locally.

## Ask The OS

- [ ] Ask: `What units are blocked?`
- [ ] Ask: `What needs inspection?`
- [ ] Ask: `Which units have not been updated in 3 hours?`
- [ ] Ask: `What are my highest priority issues?`
- [ ] Ask: `What should I tell Tony right now?`
- [ ] Answers include supporting records, uncertainty, and suggested next action.

## Briefings / Reports

- [ ] Morning Brief generates with priorities and risk areas.
- [ ] Midday Brief shows stale units, blockers, crews, and next walk path.
- [ ] End-of-Day Report uses real status counts.
- [ ] Copy button copies report text.
- [ ] Save to Daily Log appends the report locally.

## Smart Suggestions

- [ ] Open critical issue appears as a smart suggestion.
- [ ] Issue without owner appears as a smart suggestion.
- [ ] Clean-complete unit without inspection appears as needs inspection.
- [ ] Stale units are detected after 3+ hours.
- [ ] Multiple access/key issues create an access bottleneck suggestion.

## Safety / Fallback

- [ ] App works with no API key.
- [ ] No browser code references `OPENAI_API_KEY`.
- [ ] Copilot does not send messages externally.
- [ ] Copilot does not mutate data without user approval.
- [ ] Mobile Copilot layout works at iPhone width.
