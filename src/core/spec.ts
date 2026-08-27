// The one place a Project turns into something renderable. The renderer never
// sees a Project, so everything the model knows and the renderer must not care
// about — selection, ids, percent geometry — stops here.
import { toPixels } from './canvas.ts';
import { photoById } from './project.ts';
import type { ButtonSpec, Project, Spec } from './types.ts';

export function buildSpec(project: Project, photoId: string): Spec | null {
  const photo = photoById(project, photoId);
  if (photo === null) return null;

  const buttons: ButtonSpec[] = photo.buttons.map(b => ({
    styleId: b.styleId,
    fontId: b.fontId,
    text: b.text,
    color: b.color,
    rect: toPixels(b.rect, project.canvas),
    timing: { ...b.timing },
  }));

  return {
    canvas: { ...project.canvas },
    duration: project.duration,
    fps: project.fps,
    image: photo.image,
    pushIn: photo.pushIn,
    glare: photo.glare,
    buttons,
  };
}
