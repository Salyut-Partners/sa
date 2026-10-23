// Translating what the phrase book cannot: the voice-over script, and the
// fields the user has written over by hand.
//
// Both are the same shape — take what the language on screen says, ask for it in
// every other language the project carries, and write the answers back as one
// undo step. Keeping them in one place is what stops "translate the script" and
// "translate my edits" drifting into two behaviours.
import { useCallback, useRef, useState } from 'react';
import { fromText, toText } from '../core/fields.ts';
import { activeLocale, LOCALE_NAMES, pendingTranslation } from '../core/locales.ts';
import { apply, type Command, type LocaleWrite } from '../core/project.ts';
import type { FieldValue, LocaleId, Project } from '../core/types.ts';
import { translate, type TranslationResult } from './server.ts';

export interface Translator {
  busy: boolean;
  /** What happened, in the words to show under the button. */
  note: string;
  /** Whether the last thing that happened was a failure. */
  failed: boolean;
  translateScript: () => void;
  translateFields: () => void;
  /**
   * Before an export: the script into every language going out whose
   * translation is stale, and — when the buyer said so — into every one
   * that has none. Answers the project as it is after — what the export
   * plans from — or null when the translation failed, and then nothing
   * should render.
   */
  beforeExport: (choice: { fillEmpty: boolean }) => Promise<Project | null>;
  /** Empty the script of every language: a silent creative everywhere, one undo step. */
  clearScripts: () => void;
}

export function useTranslator(
  project: Project,
  dispatch: (command: Command) => void,
): Translator {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);

  // The buttons are bound once but must act on the project as it is when
  // pressed, not as it was when they were bound.
  const latest = useRef(project);
  latest.current = project;

  const run = useCallback(
    async (
      texts: readonly string[],
      // What to make of the answers. Returns one write per language.
      absorb: (result: TranslationResult, targets: readonly LocaleId[]) => LocaleWrite[],
      nothingToDo: string,
    ): Promise<void> => {
      const current = latest.current;
      const targets = current.locales.map(l => l.id).filter(id => id !== current.activeLocale);
      if (texts.length === 0 || targets.length === 0) {
        setFailed(false);
        setNote(nothingToDo);
        return;
      }
      setBusy(true);
      setFailed(false);
      setNote('Переклад…');
      try {
        const result = await translate(texts, targets);
        const writes = absorb(result, targets);
        if (writes.length > 0) dispatch({ type: 'locale/write', writes });
        setNote(describe(result, current.activeLocale, targets.length));
      } catch (e) {
        setFailed(true);
        setNote((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  const translateScript = useCallback(() => {
    const current = latest.current;
    const script = activeLocale(current).script.trim();
    const from = { id: current.activeLocale, script };
    void run(
      script === '' ? [] : [script],
      (result, targets) => targets
        .map(id => ({ id, script: result.out[id]?.[0], translatedFrom: from }))
        .filter((w): w is { id: LocaleId; script: string; translatedFrom: typeof from } => w.script !== undefined),
      'Спершу впишіть скрипт для цієї мови.',
    );
  }, [run]);

  const beforeExport = useCallback(async ({ fillEmpty }: { fillEmpty: boolean }): Promise<Project | null> => {
    const current = latest.current;
    const pending = pendingTranslation(current, { fillEmpty });
    if (pending === null) return current;
    const names = pending.targets.map(id => LOCALE_NAMES[id]).join(', ');
    setBusy(true);
    setFailed(false);
    setNote(`Перекладаю скрипт перед експортом: ${names}…`);
    try {
      const result = await translate([pending.script], pending.targets);
      const from = { id: pending.source, script: pending.script };
      const writes: LocaleWrite[] = [];
      const missing: LocaleId[] = [];
      for (const id of pending.targets) {
        const script = result.out[id]?.[0];
        if (script === undefined || script.trim() === '') missing.push(id);
        else writes.push({ id, script, translatedFrom: from });
      }
      if (missing.length > 0) {
        setFailed(true);
        setNote(`Переклад не повернувся для: ${missing.map(id => LOCALE_NAMES[id]).join(', ')} — експорт не почато.`);
        return null;
      }
      const command: Command = { type: 'locale/write', writes };
      dispatch(command);
      setNote(`Перед експортом перекладено: ${names} · ${describe(result, pending.source, writes.length)}`);
      return apply(current, command);
    } catch (e) {
      setFailed(true);
      setNote(`Скрипт не перекладено — експорт не почато: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }, [dispatch]);

  const translateFields = useCallback(() => {
    // Only the fields written by hand. Everything else follows the dictionary,
    // which is translated by people and says exactly what legal signed off on —
    // sending it through a machine would be trading that away for nothing.
    const edits = Object.entries(activeLocale(latest.current).overrides);
    void run(
      edits.map(([, value]) => toText(value)),
      (result, targets) => targets.flatMap(id => {
        const lines = result.out[id];
        if (lines === undefined) return [];
        const overrides: Record<string, FieldValue> = {};
        edits.forEach(([key, source], i) => {
          const line = lines[i];
          // Back in the shape the field it came from was in: a list went over
          // the wire as its lines, which is how the user edits it too.
          if (line !== undefined) {
            overrides[key] = fromText(line, Array.isArray(source) ? 'list' : 'line');
          }
        });
        return [{ id, overrides }];
      }),
      'Немає ручних правок — решта тексту й так словникова.',
    );
  }, [run]);

  const clearScripts = useCallback(() => {
    const writes = latest.current.locales.map(l => ({ id: l.id, script: '', translatedFrom: null }));
    dispatch({ type: 'locale/write', writes });
    setFailed(false);
    setNote('Озвучку прибрано з усіх мов.');
  }, [dispatch]);

  return { busy, note, failed, translateScript, translateFields, beforeExport, clearScripts };
}

/**
 * Who translated it and what it read the source as.
 *
 * Worth saying out loud: a machine translation is a thing to check, and knowing
 * which machine — and that it agreed about the source language — is most of what
 * checking it starts from.
 */
function describe(result: TranslationResult, from: LocaleId, count: number): string {
  const who = result.provider === 'deepl' ? 'DeepL'
    : result.provider === 'anthropic' ? 'Claude'
    : 'перекладач';
  const detected = result.detected === '' || result.detected === from
    ? ''
    : ` · провайдер визначив джерело як ${result.detected}, а не ${from}`;
  return `${who}: ${count} ${count === 1 ? 'мова' : 'мов'} · джерело ${from}${detected}`;
}
