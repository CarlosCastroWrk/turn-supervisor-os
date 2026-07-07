# Master Prompt

Los supplied the original master prompt in this Codex thread on 2026-07-04. Los supplied the current product/operator brief on 2026-07-06.

## Product

PDS / Turn Field Copilot

## Definition

A mobile-first, iPhone/iPad-compatible, local-first private field copilot for Los during a two-week student housing Turn operation.

This is a personal field notebook and execution aid. It is not official Property Doctor Services software, not company software, not a CRM, not a multi-user portal, and not a replacement for the company's process.

## Core Loop

Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn

## Key Constraints

- Local-first behavior must remain.
- Optional Supabase sync may exist, but basic field usage must not depend on internet access.
- No browser API keys.
- No official company branding or claims.
- No tenant personal information.
- No faces/private documents unless explicitly permitted.
- No payroll/payment promises.
- No automatic texting or external communication.
- No AI mutations without human confirmation.
- AI and rule-based Copilot output must create Draft Actions only.
- Memory must be approved before it is used.
- Reports must not invent numbers.
- Demo/sample data must never pollute Real Turn reports, Copilot answers, or sync conclusions.
- Must work well while walking around on iPhone/iPad.
- Must autosave locally and export data.
- Must help Los execute, communicate clearly, learn the operation, and avoid relying on memory.

## Required V0.1 Areas

- Home Dashboard
- Project Setup
- Buildings / Floors / Units
- Unit Detail View
- Crew Directory
- Assignments
- Issue Tracker
- Photo / Notes Capture
- Daily Log
- Daily Report Generator
- Training Questions / Unknowns to Verify
- Export / Backup

## Current Phase

Phase 1 Stabilize: make Real Turn Mode safe across Mac, iPhone, and iPad before adding more AI or field-experience features.

## Current Operating Goal

Make Turn Field Copilot safe enough for Los's real two-week Turn operation before relying on it with real field data.

## Current Immediate Gate

Verify the latest deployed sync fix on real devices:

1. Open or hard-refresh the PWA on Mac, iPhone, and iPad.
2. Tap `Sync now` once.
3. Wait 60-90 seconds.
4. Confirm each device settles on `Synced` instead of repeatedly cycling.

If sync still cycles, the next non-emergency slice is a pull request for sync status diagnostics.

## Development Workflow

Use pull requests for normal non-emergency work. Direct commits to `main` are reserved for urgent field hotfixes with explicit approval.

## Source Note

The full raw prompts are preserved in the conversation. This file records the normalized build directive used for implementation and future handoffs.
