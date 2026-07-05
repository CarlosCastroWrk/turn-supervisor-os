import { Camera, ShieldAlert } from 'lucide-react';
import type { EntityId, PhotoCategory, PhotoNote } from '../types';
import { PHOTO_CATEGORIES, createId, nowISO } from '../lib/constants';
import { Field } from './FormControls';

interface PhotoCaptureProps {
  projectId: EntityId;
  unitId?: EntityId;
  issueId?: EntityId;
  onAdd: (photo: PhotoNote) => void;
}

export function PhotoCapture({ projectId, unitId, issueId, onAdd }: PhotoCaptureProps) {
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const category = (event.currentTarget.form?.elements.namedItem('photoCategory') as HTMLSelectElement | null)?.value as
      | PhotoCategory
      | undefined;
    const caption = (event.currentTarget.form?.elements.namedItem('photoCaption') as HTMLInputElement | null)?.value ?? '';

    const reader = new FileReader();
    reader.onload = () => {
      onAdd({
        id: createId('photo'),
        projectId,
        unitId,
        issueId,
        imageData: typeof reader.result === 'string' ? reader.result : undefined,
        category: category ?? 'Other',
        caption,
        createdAt: nowISO(),
      });
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <form className="photo-capture">
      <div className="privacy-note">
        <ShieldAlert size={17} aria-hidden="true" />
        <span>Only capture work-related photos with permission and avoid personal/private information.</span>
      </div>
      <div className="grid two">
        <Field label="Category">
          <select name="photoCategory" defaultValue="Problem">
            {PHOTO_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field label="Caption">
          <input name="photoCaption" placeholder="Short field note" />
        </Field>
      </div>
      <label className="button button--secondary photo-input">
        <Camera size={18} aria-hidden="true" />
        <span>Add Photo</span>
        <input accept="image/*" capture="environment" type="file" onChange={handleFile} />
      </label>
      <p className="muted">Photo data stays local on this device.</p>
    </form>
  );
}

