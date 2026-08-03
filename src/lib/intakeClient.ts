// Client for the flagged Turn OS intake reader. Extraction only proposes
// rows; every result is routed into the existing human review flows and
// nothing is released or saved without an explicit confirm.

import { getSupabaseClient } from './supabase/client';

export interface IntakeRow {
  unitNumber: string;
  bedCount?: number | null;
  building?: string | null;
  trades: readonly ('paint' | 'clean')[];
  sections: readonly ('common' | 'A' | 'B' | 'C' | 'D' | 'E')[];
  touchUpSections?: readonly ('common' | 'A' | 'B' | 'C' | 'D' | 'E')[];
  cutInSections?: readonly ('common' | 'A' | 'B' | 'C' | 'D' | 'E')[];
  confidence: 'high' | 'low';
  note?: string | null;
}

export interface IntakeResult {
  rows: IntakeRow[];
  uncertainties: string[];
  provider: string;
  model: string;
  escalated: boolean;
}

export const intakeEnabled = () =>
  import.meta.env.VITE_ENABLE_INTAKE === 'true';

const MAX_EDGE = 1_800;

export const imageFileToIntakeSource = async (file: File): Promise<{
  type: 'image';
  mediaType: 'image/jpeg';
  data: string;
}> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot process the photo.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return {
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mediaType: 'image/jpeg',
    type: 'image',
  };
};

const accessToken = async (): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  return error ? null : data.session?.access_token ?? null;
};

export const requestIntake = async (payload: {
  kind: 'roster' | 'release';
  source:
    | { type: 'image'; mediaType: string; data: string }
    | { type: 'text'; text: string };
  rosterUnitNumbers?: readonly string[];
  requestedDate?: string;
}): Promise<IntakeResult> => {
  const token = await accessToken();
  if (!token) {
    throw new Error('Sign in to Sync to use photo import. Paste or manual selection still works.');
  }
  const response = await fetch('/api/importIntake/extract', {
    body: JSON.stringify({
      ...payload,
      requestedDate: payload.requestedDate
        ?? new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    }),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
    credentials: 'same-origin',
    method: 'POST',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error
        ?? 'The import reader is unavailable. Use paste or manual selection.',
    );
  }
  return body as IntakeResult;
};
