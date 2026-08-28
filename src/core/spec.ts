// The one place a Project turns into something renderable. The renderer never
// sees a Project, so everything the model knows and the renderer must not care
// about — selection, ids, percent geometry — stops here.
import { toPixels } from './canvas.ts';
import { DEFAULT_LOCALE } from './phrasebook.ts';
import { photoById } from './project.ts';
import { templateById, templateFields } from './templates.ts';
import type { LocaleId, Project, ButtonSpec, Spec, TemplateSpec } from './types.ts';

export function buildSpec(
  project: Project,
  photoId: string,
  locale: LocaleId = DEFAULT_LOCALE,
): Spec | null {
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

  const layer = photo.template;
  // A template the library no longer carries drops off the frame. Unlike a
  // button style, there is nothing sane to fall back to — a template is its own
  // layout — and a creative missing a panel beats one that will not build.
  const template: TemplateSpec | null =
    layer === null || templateById(layer.definitionId) === null ? null : {
      definitionId: layer.definitionId,
      fields: templateFields(layer, locale),
      color: photo.accent,
      timing: { ...layer.timing },
    };

  return {
    canvas: { ...project.canvas },
    duration: project.duration,
    fps: project.fps,
    image: photo.image,
    pushIn: photo.pushIn,
    glare: photo.glare,
    template,
    buttons,
  };
}
