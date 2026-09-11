import type { BatchPlan } from '../core/batch.ts';
import { activeLocale, editedFieldCount, LOCALE_NAMES } from '../core/locales.ts';
import {
  defaultButton, nextSlot, photoById, TEMPLATE_LIFT, type ButtonPatch, type Command,
} from '../core/project.ts';
import {
  buttonCount, buttonField, buttonRectField, buttonTimingField, photoField, templateChoice,
  templateOffsetField, templateTimingField,
} from '../core/selection.ts';
import { templateMoves } from '../core/templates.ts';
import type { Project } from '../core/types.ts';
import { BUTTON_STYLES, FONTS } from '../renderer/index.ts';
import { BatchPanel } from './BatchPanel.tsx';
import type { ExportRun } from './export.ts';
import { ExportPanel } from './ExportPanel.tsx';
import { FilePicker } from './FilePicker.tsx';
import type { ImportReport } from './import-files.ts';
import {
  CheckField, ColorField, NumberField, SelectField, TextField,
} from './fields.tsx';
import { describeTranslator, type VoiceCatalogue } from './server.ts';
import { StyleLibrary } from './StylePreview.tsx';
import { TemplateFields } from './TemplateFields.tsx';
import { TemplateLibrary } from './TemplatePreview.tsx';
import { TimingFields } from './TimingFields.tsx';
import type { TopicBatch } from './topic-batch.ts';
import type { Translator } from './translate.ts';
import { VoicePanel } from './VoicePanel.tsx';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  activeButton: number | null;
  setActiveButton: (index: number | null) => void;
  onFiles: (files: FileList | null) => void;
  onReplace: (files: FileList | null) => void;
  report: ImportReport;
  catalogue: VoiceCatalogue | null;
  translator: Translator;
  run: ExportRun;
  onExportOne: () => BatchPlan | null;
  topic: TopicBatch;
}

const FONT_OPTIONS = Object.values(FONTS).map(f => ({ id: f.id, label: f.label }));

export function SidePanel(props: Props) {
  const { project, dispatch, activeButton, setActiveButton } = props;
  const photo = photoById(project, project.activeId);
  /** Every write in this panel goes to the whole selection, one photo included. */
  const targets = project.selection;
  const many = targets.length > 1;

  const button = photo && activeButton !== null ? photo.buttons[activeButton] ?? null : null;
  /** Empty unless the server has told us there is no translator key at all. */
  const noTranslator = describeTranslator(props.catalogue);

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
      // Staggered by what is already on the photo in front of the user, not by
      // the slot: on an uneven batch the slot can be 0 while the active photo
      // already carries three buttons, and the new one would land under them.
      button: defaultButton(
        crypto.randomUUID(), BUTTON_STYLES[0]!.id, photo.buttons.length, photo.accent,
      ),
    });
    setActiveButton(index);
  };

  const moveButton = (from: number, to: number): void => {
    if (!photo || to < 0 || to >= photo.buttons.length) return;
    dispatch({ type: 'button/move', ids: targets, from, to });
    // The selection follows the button, not the slot: the user is still editing
    // the thing they just moved.
    if (activeButton === from) setActiveButton(to);
  };

  const duplicateButton = (index: number): void => {
    dispatch({ type: 'button/duplicate', ids: targets, index, id: crypto.randomUUID() });
    setActiveButton(index + 1);
  };

  return (
    <aside className="side">
      <BatchPanel topic={props.topic} />

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
            <div className="lab">Шаблон</div>
            <TemplateLibrary
              selectedId={templateChoice(project, targets)}
              canvas={project.canvas}
              color={photo.accent}
              locale={activeLocale(project)}
              onPick={definitionId =>
                dispatch({ type: 'template/set', ids: targets, definitionId })}
            />
          </div>

          {photo.template ? (
            // Keyed by which template is being edited, so swapping layout builds
            // the boxes afresh rather than leaving a half-typed draft sitting in
            // a box that now belongs to a different field.
            <div key={`${project.activeId}:${photo.template.definitionId}`}>
              {templateMoves(photo.template.definitionId) ? (
                <div className="group">
                  <div className="lab">
                    Положення <span className="val">% висоти кадру</span>
                  </div>
                  <div className="row">
                    <NumberField
                      value={templateOffsetField(project, targets)}
                      onChange={offsetY =>
                        dispatch({ type: 'template/patch', ids: targets, patch: { offsetY } })}
                      min={TEMPLATE_LIFT.min}
                      max={TEMPLATE_LIFT.max}
                      step={1}
                      suffix="↕"
                    />
                    <button
                      className="wide"
                      onClick={() => dispatch({
                        type: 'template/patch', ids: targets, patch: { offsetY: 0 },
                      })}
                    >
                      На місце
                    </button>
                  </div>
                  <div className="note">
                    Від'ємне — вгору. Тільки ця смуга рухається: решта шаблонів
                    затемнює все фото, і зсув потягнув би затемнення за край.
                  </div>
                </div>
              ) : null}

              <div className="group">
                <div className="lab">Час на екрані шаблону</div>
                <TimingFields
                  read={key => templateTimingField(project, targets, key)}
                  onChange={timing =>
                    dispatch({ type: 'template/patch', ids: targets, patch: { timing } })}
                  timing={photo.template.timing}
                  duration={project.duration}
                />
                <div className="note">
                  Шаблон приходить своєю анімацією; ця — понад неї.
                </div>
              </div>

              <div className="group">
                <div className="lab">
                  Тексти
                  <span className="val">{LOCALE_NAMES[project.activeLocale]}</span>
                </div>
                <div className="note">
                  Текст належить мові, не фото: правка лягає на всю пачку в цій мові.
                </div>
                <button
                  className="wide"
                  style={{ marginTop: 8 }}
                  disabled={
                    props.translator.busy || project.locales.length < 2 || noTranslator !== ''
                  }
                  onClick={props.translator.translateFields}
                >
                  Перекласти правки на решту мов
                  <span className="val"> {editedFieldCount(project)}</span>
                </button>
                {noTranslator === '' ? null : <div className="warn">{noTranslator}</div>}
              </div>

              <TemplateFields
                project={project}
                definitionId={photo.template.definitionId}
                dispatch={dispatch}
              />
            </div>
          ) : null}

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
                  {/* The list is paint order, so moving down the list moves the
                      button up the stack. The titles name the stack rather than
                      the list: which button is on top is the reason to reorder. */}
                  <button
                    className="ic"
                    title="Опустити під сусідню"
                    disabled={i === 0}
                    onClick={e => { e.stopPropagation(); moveButton(i, i - 1); }}
                  >
                    ↑
                  </button>
                  <button
                    className="ic"
                    title="Підняти над сусідньою"
                    disabled={i === photo.buttons.length - 1}
                    onClick={e => { e.stopPropagation(); moveButton(i, i + 1); }}
                  >
                    ↓
                  </button>
                  <button
                    className="ic"
                    title="Дублювати"
                    onClick={e => { e.stopPropagation(); duplicateButton(i); }}
                  >
                    ⧉
                  </button>
                  <button
                    className="ic rm"
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
            {photo.buttons.length > 1 ? (
              <div className="note">Остання в списку лежить на кадрі зверху.</div>
            ) : null}
            <button className="wide" style={{ marginTop: 8 }} onClick={addButton}>
              + Додати кнопку
            </button>
          </div>

          {button && activeButton !== null ? (
            // Keyed by what is being edited, so switching button or photo builds
            // the controls afresh. A number box holds what was typed into it
            // until it is committed, and without this that half-typed value
            // would be sitting in the box of whatever was opened next.
            <div key={`${project.activeId}:${activeButton}`}>
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
                  fontId={button.fontId}
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

              <div className="group">
                <div className="lab">Шрифт</div>
                <SelectField
                  value={buttonField(project, targets, activeButton, 'fontId')}
                  options={FONT_OPTIONS}
                  onChange={fontId => patchButton({ fontId })}
                />
              </div>

              <div className="group">
                <div className="lab">
                  Позиція і розмір <span className="val">% полотна</span>
                </div>
                <div className="row">
                  <NumberField
                    value={buttonRectField(project, targets, activeButton, 'x')}
                    onChange={x => patchButton({ rect: { x } })}
                    min={0} max={100} step={0.1} suffix="X"
                  />
                  <NumberField
                    value={buttonRectField(project, targets, activeButton, 'y')}
                    onChange={y => patchButton({ rect: { y } })}
                    min={0} max={100} step={0.1} suffix="Y"
                  />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <NumberField
                    value={buttonRectField(project, targets, activeButton, 'w')}
                    onChange={w => patchButton({ rect: { w } })}
                    min={0} max={100} step={0.1} suffix="Ш"
                  />
                  <NumberField
                    value={buttonRectField(project, targets, activeButton, 'h')}
                    onChange={h => patchButton({ rect: { h } })}
                    min={0} max={100} step={0.1} suffix="В"
                  />
                </div>
                <div className="note">Стрілками — по пікселю, з Shift — по десять.</div>
              </div>

              <div className="group">
                <div className="lab">Час на екрані</div>
                <TimingFields
                  read={key => buttonTimingField(project, targets, activeButton, key)}
                  onChange={timing => patchButton({ timing })}
                  timing={button.timing}
                  duration={project.duration}
                />
              </div>
            </div>
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

          <VoicePanel
            project={project}
            dispatch={dispatch}
            catalogue={props.catalogue}
            translator={props.translator}
          />
          {props.translator.note === '' ? null : (
            <div className={props.translator.failed ? 'error' : 'note'}>
              {props.translator.note}
            </div>
          )}

          <hr />

          <ExportPanel
            project={project}
            dispatch={dispatch}
            run={props.run}
            onExportOne={props.onExportOne}
            topic={props.topic}
          />
        </>
      ) : null}
    </aside>
  );
}
