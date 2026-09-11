// The one place a Project turns into something renderable. The renderer never
// sees a Project, so everything the model knows and the renderer must not care
// about — selection, ids, percent geometry, the dictionary — stops here.
import { toPixels } from './canvas.ts';
import { activeLocale, localeById, newLocale } from './locales.ts';
import { photoById } from './project.ts';
import { templateById, templateFields } from './templates.ts';
import type { LocaleId, Project, ButtonSpec, Spec, TemplateSpec } from './types.ts';

export function buildSpec(
  project: Project,
  photoId: string,
  localeId?: LocaleId,
): Spec | null {
  const photo = photoById(project, photoId);
  if (photo === null) return null;

  // A language the project does not carry still builds — as a fresh one: the
  // dictionary alone, no edits, no script. That is what a library chip wants,
  // and it keeps a stale id in a saved file from blanking a frame. It must not
  // borrow from the language on screen: a Spec for Italian carrying the German
  // script would ship a video speaking the wrong language.
  const locale = localeId === undefined
    ? activeLocale(project)
    : localeById(project, localeId) ?? newLocale(localeId);

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
      fields: templateFields(layer.definitionId, locale),
      color: photo.accent,
      offsetY: layer.offsetY,
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
    locale: locale.id,
    script: locale.script.trim(),
    // A language that has not picked its own speaks with the project's, which
    // may itself be empty — "whichever the provider offers first", resolved at
    // synthesis where the list of voices is.
    voiceId: locale.voiceId ?? project.voiceId,
    modelId: project.modelId,
  };
}
