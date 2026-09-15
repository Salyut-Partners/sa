// The plan's lines as the buyer reads them. The plan, the CLI and Claude's
// skills speak of files and commands — `campaign.yaml`, `sa plan`, builder —
// because that is where a hand goes to fix a thing. The launches tab shows the
// same lines without them: a file becomes what it holds, a command the button
// that does it. The technical line stays the source; the copy button and the
// terminal keep it whole.

const WORDS: readonly [RegExp, string][] = [
  // A command in backticks goes whole, its arguments with it; a bare one only by its name.
  [/`sa apply[^`]*`|\bsa apply\b/g, 'кнопка «Залити»'],
  [/`sa plan[^`]*`|\bsa plan\b/g, 'кнопка «Оновити план»'],
  [/`sa (?:expand|new campaign|new|adopt)[^`]*`|\bsa (?:expand|new campaign|new|adopt)\b/g, 'Claude'],
  [/`?campaigns\/([a-z0-9._-]+)\/campaign\.yaml`?/g, 'кампанія $1, налаштування'],
  [/`?campaigns\/([a-z0-9._-]+)\/state\.json`?/g, 'кампанія $1, запис про залив'],
  [/`?campaigns\/([a-z0-9._-]+)`?/g, 'кампанія $1'],
  [/`?campaign\.yaml`?/g, 'налаштування кампанії'],
  [/`?topic\.yaml`?/g, 'налаштування топіка'],
  [/`?state\.json`?/g, 'запис про залив'],
  [/`?script\.md`?/g, 'скрипт'],
  [/`?keywords\.txt`?/g, 'ключі'],
  [/`?article\.md`?/g, 'стаття'],
  [/`?creatives\/rejected\/`?/g, 'відхилені креативи'],
  [/`?creatives\/`?/g, 'тека креативів'],
  [/`?termgroups\/`?/g, 'термгрупи'],
  [/`?articles\/`?/g, 'статті'],
  [/\bapply (?=відмов)/g, 'залив '],
  [/\bbuilder\b/g, 'збірка'],
  [/`/g, ''],
];

/** A plan line, a warning or an error with the file names and commands turned into what the buyer sees. */
export const forBuyer = (line: string): string => WORDS.reduce((text, [pattern, words]) => text.replace(pattern, words), line);
