import { useState } from 'react';
import { photoById, type Command, type TemplateSlot } from '../core/project.ts';
import { activeLocale } from '../core/locales.ts';
import { templateChoice, templateTimingField } from '../core/selection.ts';
import type { Project } from '../core/types.ts';
import { TemplateFields } from './TemplateFields.tsx';
import { TemplateLibrary } from './TemplatePreview.tsx';
import { TimingFields } from './TimingFields.tsx';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  slot: TemplateSlot;
}

const TITLES: Record<TemplateSlot, string> = {
  template: 'Шаблон',
  overlay: 'Накладка',
};

/**
 * One of a photo's two template layers, edited: the library to pick from, and
 * once something is picked, where it sits, when it is on screen and what it
 * says. The layout and the overlay drawn over it are the same controls aimed
 * at a different slot, which is why they are one component.
 *
 * The overlay's library starts folded. Most photos wear one layout, and a
 * second full catalogue of moving thumbnails under the first is a lot of panel
 * for a choice most batches never make.
 */
export function TemplateSlotPanel({ project, dispatch, slot }: Props) {
  const photo = photoById(project, project.activeId);
  const targets = project.selection;
  const layer = photo?.[slot] ?? null;
  const [open, setOpen] = useState(false);
  if (photo === null) return null;

  const folded = slot === 'overlay' && layer === null && !open;

  return (
    <>
      <div className="group">
        <div className="lab">{TITLES[slot]}</div>
        {slot === 'overlay' ? (
          <div className="note">Малюється поверх шаблону й під кнопками: плашка, сповіщення.</div>
        ) : null}
        {folded ? (
          <button className="wide" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
            Додати накладку
          </button>
        ) : (
          <TemplateLibrary
            selectedId={templateChoice(project, targets, slot)}
            canvas={photo.canvas}
            color={photo.accent}
            locale={activeLocale(project)}
            onPick={definitionId => {
              dispatch({ type: 'template/set', ids: targets, definitionId, slot });
              if (definitionId === null) setOpen(false);
            }}
          />
        )}
      </div>

      {layer ? (
        // Keyed by which template is being edited, so swapping layout builds
        // the boxes afresh rather than leaving a half-typed draft sitting in
        // a box that now belongs to a different field.
        <div key={`${project.activeId}:${slot}:${layer.definitionId}`}>
          <div className="group">
            <div className="lab">Положення</div>
            <button
              className="wide"
              disabled={layer.offsetX === 0 && layer.offsetY === 0}
              onClick={() => dispatch({
                type: 'template/patch', ids: targets, patch: { offsetX: 0, offsetY: 0 }, slot,
              })}
            >
              На місце
            </button>
            <div className="note">
              Клацніть шаблон на кадрі й тягніть. Затемнення лишається на місці,
              рухається вміст — і не далі краю кадру.
            </div>
          </div>

          <div className="group">
            <div className="lab">Час на екрані: {TITLES[slot].toLowerCase()}</div>
            <TimingFields
              read={key => templateTimingField(project, targets, key, slot)}
              onChange={timing =>
                dispatch({ type: 'template/patch', ids: targets, patch: { timing }, slot })}
              timing={layer.timing}
              duration={project.duration}
            />
            <div className="note">
              Шаблон приходить своєю анімацією; ця — понад неї.
            </div>
          </div>

          <TemplateFields project={project} definitionId={layer.definitionId} dispatch={dispatch} />
        </div>
      ) : null}
    </>
  );
}
