import { fromText, type Field } from '../core/fields.ts';
import { activeLocale } from '../core/locales.ts';
import type { Command } from '../core/project.ts';
import { just } from '../core/selection.ts';
import { fieldEdited, fieldText, templateById } from '../core/templates.ts';
import type { Project } from '../core/types.ts';
import { TextAreaField, TextField } from './fields.tsx';

interface Props {
  project: Project;
  definitionId: string;
  dispatch: (command: Command) => void;
}

/** How tall a box a kind of field wants. A list grows with what is in it. */
const rowsFor = (field: Field, text: string): number =>
  field.kind === 'list' ? Math.min(9, Math.max(3, text.split('\n').length)) : 3;

/**
 * The template's own form, built from its schema.
 *
 * Nothing here names a field, a template or a kind of offer: the boxes come from
 * the record in the library, which is what lets a template be added without the
 * editor learning anything about it.
 *
 * What the boxes hold belongs to the language on screen, not to the selection.
 * The offer is the batch's — four photos advertising four different jobs is four
 * projects — so there is nothing here for photos to disagree about, and the one
 * disagreement that matters is between languages. Switching the language bar
 * re-reads every box.
 */
export function TemplateFields({ project, definitionId, dispatch }: Props) {
  const info = templateById(definitionId);
  if (info === null) return null;
  const locale = activeLocale(project);

  return (
    <>
      {info.schema.map(field => {
        const text = fieldText(locale, field);
        const edited = fieldEdited(locale, field.key);
        const write = (typed: string): void =>
          dispatch({
            type: 'locale/field', id: locale.id, key: field.key,
            value: fromText(typed, field.kind),
          });

        return (
          <div className="group" key={field.key}>
            <div className="lab">
              {field.label}
              {/* The mark says this box no longer follows the dictionary — which
                  is worth knowing before the batch goes out in seven languages. */}
              {edited ? <span className="edited" title="Змінено вручну">●</span> : null}
              {edited ? (
                <button
                  className="link"
                  onClick={() =>
                    dispatch({ type: 'locale/field', id: locale.id, key: field.key, value: null })}
                >
                  скинути
                </button>
              ) : null}
            </div>
            {field.kind === 'line'
              ? <TextField value={just(text)} onChange={write} />
              : (
                <TextAreaField
                  value={just(text)}
                  onChange={write}
                  rows={rowsFor(field, text)}
                  holdUntilBlur={field.kind === 'list'}
                />
              )}
            {field.kind === 'list' ? <div className="note">По одному рядку на елемент.</div> : null}
          </div>
        );
      })}
    </>
  );
}
