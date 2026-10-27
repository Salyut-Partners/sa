// Saving and opening a project as a file. The browser's only way to hand a file
// out is a link it clicks itself, and its only way to take one is an input — both
// of which are plumbing the App has no reason to carry.
import { fromFile, toFile, type LoadFailure, type LoadResult } from '../core/serialize.ts';
import type { Project } from '../core/types.ts';

export const PROJECT_FILE_NAME = 'creatives.json';

export function saveProjectFile(project: Project, name = PROJECT_FILE_NAME): void {
  const blob = new Blob([JSON.stringify(toFile(project), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Revoked late: the download is started by the click but not finished by it.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function openProjectFile(file: File): Promise<LoadResult> {
  try {
    return fromFile(JSON.parse(await file.text()));
  } catch {
    // Not JSON at all lands in the same place as JSON that is not a project.
    return { ok: false, reason: 'not-a-project' };
  }
}

/** What to tell the user when a file will not open. */
export function explainRefusal(reason: LoadFailure): string {
  switch (reason) {
    case 'version':
      return 'файл зроблений іншою версією редактора';
    case 'too-many':
      return 'у файлі більше фото, ніж вміщає проєкт';
    case 'not-a-project':
      return 'це не файл проєкту';
  }
}
