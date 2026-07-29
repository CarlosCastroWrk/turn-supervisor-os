import type { AppData } from '../../types';
import type { PropertyContact, TrackAAppData, TrackAProject } from './contracts';

const cloneContacts = (contacts: readonly PropertyContact[]) =>
  contacts.map((contact) => structuredClone(contact));

/**
 * Adapts the current AppData shape to Track A without changing shared types,
 * persistence, sync, or remote schemas.
 */
export function adaptAppDataForTrackA(
  data: Readonly<AppData>,
  propertyContacts?: readonly PropertyContact[],
): TrackAAppData {
  const source = data as Readonly<TrackAAppData>;
  return {
    ...structuredClone(data),
    projects: source.projects.map((project) =>
      structuredClone(project) as TrackAProject),
    propertyContacts: cloneContacts(propertyContacts ?? source.propertyContacts ?? []),
  };
}
