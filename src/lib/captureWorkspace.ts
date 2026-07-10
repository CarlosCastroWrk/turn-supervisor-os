import type { DraftAction, EntityId, Unit } from '../types';

export interface CaptureTextAttachment {
  name: string;
  content: string;
}

export interface StagedPhotoAttachment {
  id: string;
  kind: 'photo';
  name: string;
  blob: Blob;
  previewUrl: string;
  originalBytes: number;
  compressedBytes: number;
  targetUnitId: string;
  savedPhotoId?: string;
}

export interface StagedTextAttachment {
  id: string;
  kind: 'text';
  name: string;
  content: string;
  byteSize: number;
}

export type StagedCaptureAttachment = StagedPhotoAttachment | StagedTextAttachment;

const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const buildCaptureInput = (note: string, files: CaptureTextAttachment[]) => {
  const sections = [note.trim()];

  for (const file of files) {
    const content = file.content.trim();
    if (!content) continue;
    sections.push(`Attached file ${file.name}:\n${content}`);
  }

  return sections.filter(Boolean).join('\n\n');
};

export const inferSingleCaptureUnitId = (
  drafts: DraftAction[],
  units: Unit[],
  projectId: EntityId,
) => {
  const unitNumbers = new Set(
    drafts
      .map((draft) => payloadString(draft, 'unitNumber'))
      .filter(Boolean),
  );

  if (unitNumbers.size !== 1) {
    return undefined;
  }

  const [unitNumber] = [...unitNumbers];
  return units.find((unit) => unit.projectId === projectId && unit.unitNumber === unitNumber)?.id;
};

export const isSupportedCaptureTextFile = (fileName: string, mimeType: string) => {
  const normalizedName = fileName.toLowerCase();
  const normalizedType = mimeType.toLowerCase();

  return (
    normalizedType.startsWith('text/') ||
    normalizedType === 'application/json' ||
    normalizedType === 'application/csv' ||
    normalizedName.endsWith('.csv') ||
    normalizedName.endsWith('.txt') ||
    normalizedName.endsWith('.json') ||
    normalizedName.endsWith('.eml')
  );
};
