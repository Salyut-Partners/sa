import { defaultButton, nextSlot, photoById, type ButtonPatch, type Command } from '../core/project.ts';
import { buttonCount, buttonField, photoField } from '../core/selection.ts';
import type { Project } from '../core/types.ts';
import { BUTTON_STYLES } from '../renderer/index.ts';
import { FilePicker } from './FilePicker.tsx';
import type { ImportReport } from './import-files.ts';
import { CheckField, ColorField, TextField } from './fields.tsx';
import { StyleLibrary } from './StylePreview.tsx';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  activeButton: number | null;
  setActiveButton: (index: number | null) => void;
  onFiles: (files: FileList | null) => void;
  onReplace: (files: FileList | null) => void;
  report: ImportReport;
  status: string;
  busy: boolean;
  onExport: () => void;
}

export function SidePanel(props: Props) {
  const { project, dispatch, activeButton, setActiveButton } = props;
  const photo = photoById(project, project.activeId);
  /** Every write in this panel goes to the whole selection, one photo included. */
  const targets = project.selection;
  const many = targets.length > 1;

  const button = photo && activeButton !== null ? photo.buttons[activeButton] ?? null : null;

  const patchButton = (patch: ButtonPatch): void => {
    if (activeButton === null) return;
    dispatch({ type: 'button/patch', ids: targets, index: activeButton, patch });
  };

  const addButton = (): void => {
    if (!photo) return;
    // Not this photo's end — the slot the button will occupy in all of them.
    const index = nextSlot(project, targets);
    dispatch({
      type: 'button/add',
      ids: targets,
      index,
      button: defaultButton(crypto.randomUUID(), BUTTON_STYLES[0]!.id, index, photo.accent),
    });
    setActiveButton(index);
  };

  return (
    <aside className="side">
      <div className="group">
        <div className="lab">Фото</div>
        {/* Dropping is handled for the whole window, not just this target — so
            this is only the way in by clicking. */}
        <FilePicker className="drop" accept="image/*" multiple onPick={props.onFiles}>
          <span className="t">Перетягніть або натисніть</span>
          <span className="s">одразу декілька, вертикальні 9:16</span>
        </FilePicker>
        {props.report.rejected.map(line => <div className="error" key={line}>{line}</div>)}
        {props.report.warnings.map(line => <div className="warn" key={line}>{line}</div>)}
      </div>

      {photo ? (
        <>
          <div className="group">
            <div className="lab">
              Редагується
              <span className="val">{many ? `${targets.length} фото` : photo.name}</span>
            </div>
            <div className="row">
              <button
                className="wide"
                disabled={targets.length === project.photos.length}
                onClick={() => dispatch({ type: 'selection/all' })}
              >
                Обрати всі
              </button>
              <button className="wide" disabled={!many} onClick={() => dispatch({ type: 'selection/one' })}>
                Тільки це
              </button>
            </div>
            {many ? (
              <div className="note">Зміни лягають на всі {targets.length} обраних фото.</div>
            ) : null}
          </div>

          <div className="group">
            <div className="row">
              <FilePicker className="wide" accept="image/*" onPick={props.onReplace}>
                Замінити зображення
              </FilePicker>
              <button
                className="wide"
                onClick={() => {
                  dispatch({ type: 'photo/remove', id: photo.id });
                  setActiveButton(null);
                }}
              >
                Прибрати фото
              </button>
            </div>
          </div>

          <hr />

          <div className="group">
            <div className="lab">
              Кнопки <span className="val">{photo.buttons.length}</span>
            </div>
            {many && buttonCount(project, targets).mixed ? (
              <div className="warn">
                У обраних фото різна кількість кнопок — вони зіставляються за позицією в списку.
              </div>
            ) : null}
            <div className="buttons-list">
              {photo.buttons.map((b, i) => (
                <div
                  key={b.id}
                  className={'button-row' + (i === activeButton ? ' on' : '')}
                  onClick={() => setActiveButton(i)}
                >
                  <span className="nm">{b.text || '(без тексту)'}</span>
                  <button
                    className="rm"
                    title="Видалити"
                    onClick={e => {
                      e.stopPropagation();
                      dispatch({ type: 'button/remove', ids: targets, index: i });
                      setActiveButton(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className="wide" style={{ marginTop: 8 }} onClick={addButton}>
              + Додати кнопку
            </button>
          </div>

          {button && activeButton !== null ? (
            <>
              <div className="group">
                <div className="lab">Текст кнопки</div>
                <TextField
                  value={buttonField(project, targets, activeButton, 'text')}
                  onChange={text => patchButton({ text })}
                />
              </div>

              <div className="group">
                <div className="lab">Стиль</div>
                <StyleLibrary
                  selectedId={buttonField(project, targets, activeButton, 'styleId')}
                  color={button.color}
                  text={button.text}
                  onPick={styleId => patchButton({ styleId })}
                />
              </div>

              <div className="group">
                <div className="lab">Колір кнопки</div>
                <ColorField
                  value={buttonField(project, targets, activeButton, 'color')}
                  onChange={color => patchButton({ color })}
                />
              </div>
            </>
          ) : null}

          <hr />

          <div className="group">
            <div className="lab">
              Тривалість <span className="val">{project.duration.toFixed(1)} с</span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={0.5}
              value={project.duration}
              onChange={e =>
                dispatch({ type: 'project/patch', patch: { duration: Number(e.target.value) } })}
            />
          </div>

          <div className="group">
            <div className="lab">Анімація</div>
            <CheckField
              label="Блік по кнопці"
              value={photoField(project, targets, 'glare')}
              onChange={glare => dispatch({ type: 'photo/patch', ids: targets, patch: { glare } })}
            />
            <CheckField
              label="Повільний наїзд на фон"
              value={photoField(project, targets, 'pushIn')}
              onChange={pushIn => dispatch({ type: 'photo/patch', ids: targets, patch: { pushIn } })}
            />
          </div>

          <hr />

          <button className="primary" disabled={props.busy} onClick={props.onExport}>
            Експортувати MP4
          </button>
          <div className="note">{props.status}</div>
        </>
      ) : null}
    </aside>
  );
}
