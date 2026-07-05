# Sync/Voice/AI Upgrade — Manual QA Checklist

Run the relevant section on a real iPhone AND iPad before trusting a slice in the
field. The baseline Copilot checklist is in `copilot-manual-checklist.md`.

## Before any push while in the field (every time)

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] App loads from preview URL on phone; Dashboard, Units, Copilot, Export all render
- [ ] Create a unit update + an issue; both persist after a refresh
- [ ] JSON export still downloads and contains today's data
- [ ] Only after the preview URL checks pass: merge to main (production)

## Slice 0/1 — Deploy + Supabase project

- [ ] Production URL installs to Home Screen (iPhone + iPad)
- [ ] Airplane mode: installed app still opens and shows data
- [ ] Supabase signups disabled after creating the one account
- [ ] RLS smoke test: with a second test account, `select * from units` returns zero rows

## Slice 2 — Sync (highest risk; do not skip any line)

- [ ] Fresh sign-in on a device with existing localStorage: local data uploads, nothing lost
- [ ] Edit unit on iPhone → appears on iPad within seconds (Realtime)
- [ ] Airplane mode on iPhone → make 5 edits → reconnect → all 5 reach iPad
- [ ] Conflict: edit the SAME unit on both devices while both offline → reconnect → newest edit wins, activity log shows both
- [ ] Kill the app mid-sync → reopen → no duplicate rows, outbox drains
- [ ] `VITE_ENABLE_SYNC=false` build behaves exactly like the old local-only app
- [ ] Export JSON before AND after first sync; diff shows no lost records

## Slice 3 — Photos

- [ ] 10 photos on iPhone camera → all upload, each under ~500KB in Storage
- [ ] Photos taken offline queue and upload on reconnect
- [ ] Photo visible on the other device after sync
- [ ] Old base64 photos still render

## Slice 4 — AI routes

- [ ] `ANTHROPIC_API_KEY` absent from the built JS bundle: `grep -r "sk-ant" dist/` is empty
- [ ] /api/ai/extract rejects requests without a valid Supabase JWT
- [ ] README example note produces ~6 sensible drafts, all pending (nothing auto-applied)
- [ ] Ready-gate: a draft setting overallStatus Ready on an incomplete unit still fails on apply
- [ ] Offline / flag off: Copilot falls back to the local rule-based provider

## Slice 5 — Voice

- [ ] Record 30s in a noisy environment → transcript readable → drafts sensible
- [ ] Recording while offline is kept (IndexedDB) and processed on reconnect
- [ ] Raw transcript + audio retrievable after drafts are applied (audit trail)
- [ ] Dictation-into-textarea path still works as fallback

## Slice 6 — Notifications

- [ ] Permission prompt only appears after tapping "Enable reminders"
- [ ] Morning + EOD pushes arrive on installed PWA (iPhone)
- [ ] No more than 4 pushes in a day; quiet hours respected
