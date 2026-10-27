// The one place a Project turns into something renderable. The renderer never
// sees a Project, so everything the model knows and the renderer must not care
// about — selection, ids, percent geometry, the dictionary — stops here.
import { toPixels } from './canvas.ts';
import { activeLocale, localeById, newLocale } from './locales.ts';
import { photoById } from './project.ts';
import { templateById, templateFields } from './templates.ts';
import type { LocaleId, Project, ButtonSpec, Spec, TemplateLayer, TemplateSpec } from './types.ts';

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
    rect: toPixels(b.rect, photo.canvas),
    timing: { ...b.timing },
  }));

  // A template the library no longer carries drops off the frame. Unlike a
  // button style, there is nothing sane to fall back to — a template is its own
  // layout — and a creative missing a panel beats one that will not build.
  const resolve = (layer: TemplateLayer | null): TemplateSpec | null =>
    layer === null || templateById(layer.definitionId) === null ? null : {
      definitionId: layer.definitionId,
      fields: templateFields(layer.definitionId, locale),
      color: photo.accent,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      timing: { ...layer.timing },
    };

  return {
    canvas: { ...photo.canvas },
    duration: project.duration,
    fps: project.fps,
    image: photo.image,
    pushIn: photo.pushIn,
    glare: photo.glare,
    template: resolve(photo.template),
    overlay: resolve(photo.overlay),
    buttons,
    locale: locale.id,
    script: locale.script.trim(),
    // One voice for every language: a multilingual model speaks them all, and
    // a second voice to pick per language was a choice nobody could tell from
    // the first. Empty in a project from before the editor picked one — "the
    // first the provider offers", resolved at synthesis where the list is.
    voiceId: project.voiceId,
    modelId: project.modelId,
    voiceOn: project.voiceOn,
    music: project.music,
  };
}
