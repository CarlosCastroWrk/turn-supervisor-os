import { z } from 'zod';
import {
  ASSIGNMENT_SECTIONS,
  type AssignmentExtractionCandidate,
  type AssignmentIntakeDraft,
  type AssignmentPersonalRecordProposal,
} from './types';

const boundedText = (maximum: number) => z.string().trim().max(maximum);

const SensitiveMaterialCodeSchema = z.enum([
  'signature',
  'w9-or-tax-form',
  'paycard-or-payroll',
  'access-credential',
  'tenant-sensitive',
  'provider-detected-sensitive-material',
]);

const AssignmentAccessSignalSchema = z.enum([
  'occupied-claim',
  'renewal-claim',
  'do-not-enter-claim',
  'access-blocked-claim',
]);

export const AssignmentExtractionCandidateSchema = z
  .object({
    unit: boundedText(24),
    unitType: boundedText(80).optional(),
    sectionMentions: z.array(boundedText(24)).max(12),
    tradeMentions: z
      .array(
        z
          .object({
            trade: boundedText(40),
            sections: z.array(boundedText(24)).max(12),
            scopeText: boundedText(500),
          })
          .strict(),
      )
      .max(12),
    originalExcerpt: boundedText(1_000),
    confidence: z.number().min(0).max(1),
    uncertainties: z.array(boundedText(500)).max(30),
    accessSignals: z.array(AssignmentAccessSignalSchema).max(8),
    suggestedInterpretation: boundedText(1_000),
    sensitiveMaterialDetected: z.array(SensitiveMaterialCodeSchema).max(12),
  })
  .strict();

const AssignmentSectionSchema = z.enum(ASSIGNMENT_SECTIONS);

const AssignmentTradeScopeDraftSchema = z
  .object({
    state: z.enum(['included', 'not-mentioned', 'uncertain']),
    sections: z.array(AssignmentSectionSchema).max(6),
    description: boundedText(500),
  })
  .strict();

const OccupancyAccessConflictSchema = z
  .object({
    id: boundedText(120),
    signal: AssignmentAccessSignalSchema,
    message: boundedText(500),
    acknowledgementRequired: z.literal(true),
  })
  .strict();

export const AssignmentIntakeDraftSchema = z
  .object({
    id: boundedText(120),
    sourceId: boundedText(120),
    unit: boundedText(24),
    unitType: boundedText(80).optional(),
    sections: z.array(AssignmentSectionSchema).max(6),
    paintScope: AssignmentTradeScopeDraftSchema,
    cleanScope: AssignmentTradeScopeDraftSchema,
    originalExcerpt: boundedText(1_000),
    confidence: z.number().min(0).max(1),
    uncertainties: z.array(boundedText(500)).max(30),
    duplicateWarnings: z.array(boundedText(500)).max(30),
    occupancyAccessConflicts: z.array(OccupancyAccessConflictSchema).max(12),
    sourceWarnings: z
      .array(
        z
          .object({
            id: boundedText(120),
            code: z.enum([
              'prompt-injection-language',
              'unverified-authority-claim',
              'binary-source-manually-transcribed',
            ]),
            message: boundedText(500),
            acknowledgementRequired: z.literal(true),
          })
          .strict(),
      )
      .max(12),
    validationConflicts: z
      .array(
        z
          .object({
            id: boundedText(120),
            code: z.enum([
              'missing-unit',
              'unknown-unit',
              'unit-type-mismatch',
              'missing-section',
              'unknown-section',
              'unknown-trade',
              'source-excerpt-mismatch',
            ]),
            message: boundedText(500),
            severity: z.literal('blocking'),
            value: boundedText(120).optional(),
          })
          .strict(),
      )
      .max(30),
    suggestedInterpretation: boundedText(1_000),
    authority: z.literal('none'),
    writesOperationalState: z.literal(false),
    explicitConfirmationRequired: z.literal(true),
  })
  .strict();

export const AssignmentPersonalRecordProposalSchema = z
  .object({
    kind: z.literal('assignment-personal-record-proposal'),
    id: boundedText(160),
    draftId: boundedText(120),
    sourceId: boundedText(120),
    confirmedAt: z.string().datetime(),
    confirmedBy: z.literal('Los'),
    unit: boundedText(24),
    unitType: boundedText(80).optional(),
    sections: z.array(AssignmentSectionSchema).max(6),
    paintScope: AssignmentTradeScopeDraftSchema,
    cleanScope: AssignmentTradeScopeDraftSchema,
    originalExcerpt: boundedText(1_000),
    confidence: z.number().min(0).max(1),
    uncertainties: z.array(boundedText(500)).max(30),
    duplicateWarnings: z.array(boundedText(500)).max(30),
    occupancyAccessConflicts: z.array(OccupancyAccessConflictSchema).max(12),
    suggestedInterpretation: boundedText(1_000),
    scope: z.literal('personal-record-proposal-only'),
    authority: z.literal('none'),
    paperRemainsAuthoritative: z.literal(true),
    requiresDeterministicApplication: z.literal(true),
    writesOperationalState: z.literal(false),
  })
  .strict();

export const parseAssignmentExtractionCandidate = (
  value: unknown,
): AssignmentExtractionCandidate => AssignmentExtractionCandidateSchema.parse(value);

export const parseAssignmentIntakeDraft = (value: unknown): AssignmentIntakeDraft =>
  AssignmentIntakeDraftSchema.parse(value);

export const parseAssignmentPersonalRecordProposal = (
  value: unknown,
): AssignmentPersonalRecordProposal => AssignmentPersonalRecordProposalSchema.parse(value);
