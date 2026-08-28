# Що поправити після E5

**Статус:** готово до роботи
**Дата:** 2026-08-28
**Базовий коміт:** `b99b33f` (E5 — мови й випуск)
**Контекст:** PRD у [`prd-creative-factory-search.md`](prd-creative-factory-search.md), опис коду — у `README.md`

Знайдено під час рев'ю E5. Обидва баги **не ламають роботу**: експорт проходить,
файли виходять правильні й програються. Це дефекти, а не поломки — тому вони тут,
а не у гарячому виправленні.

Перед початком: `npm test` (334 тести) і `npm run typecheck` мають бути зелені.

---

## Баг 1 — нумерація файлів розходиться між двома кнопками експорту

**Складність:** кілька рядків плюс тест.

### Що не так

`planBatch` нумерує фото за позицією у **виділенні**, `planOne` — за позицією у
**всій пачці**. Той самий креатив дістає різне ім'я залежно від того, яку кнопку
натиснули.

Відтворення (`src/core/batch.ts`), чотири фото `a b c d`, виділене лише третє:

```
експорт пачки           -> 01-c-en.mp4
експорт цього креативу  -> 03-c-en.mp4
експорт пачки, ⌘A       -> 01-a  02-b  03-c  04-d
```

Тобто `c.jpg` — це `01` або `03` залежно від виділення й від кнопки.

### Чому саме так виходить

`src/core/batch.ts:57` — `planBatch` бере індекс у відфільтрованому списку:

```ts
const selected = project.photos.filter(p => chosen.has(p.id));
return group(selected.flatMap(
  (photo, index) => locales.map(locale => itemFor(project, photo.id, photo.name, index, locale)),
));
```

`src/core/batch.ts:76` — `planOne` бере індекс у повному списку:

```ts
const index = project.photos.findIndex(p => p.id === photoId);
```

### Як правильно

Правильний варіант — **позиція у `project.photos`**, тобто те, що вже робить
`planOne`. Так каже і власний коментар `planBatch` на рядку 60:

> Grid order, not click order: the archive is numbered by where a photo sits in
> the batch, and that has to be stable across two exports of the same work.

«Where a photo sits in the batch» — це сітка, а не виділення. І «stable across
two exports» ламається саме тому, що при зміні виділення нумерація їде.

### Що зробити

У `planBatch` брати індекс фото в `project.photos`, а не в `selected`. Наприклад,
пройти по всіх фото і пропускати невиділені, замість того щоб фільтрувати наперед:

```ts
export function planBatch(project: Project): BatchPlan {
  const locales = releaseLocales(project).map(l => l.id);
  const chosen = new Set(project.selection);
  // Позиція в сітці, а не у виділенні: номер у назві означає, де фото лежить у
  // пачці, і має бути той самий, скільки б з неї зараз не було виділено.
  return group(project.photos.flatMap((photo, index) =>
    chosen.has(photo.id)
      ? locales.map(locale => itemFor(project, photo.id, photo.name, index, locale))
      : []));
}
```

Коментар на рядках 60–61 переписати під те, що код справді робить.

### Тести

У `src/core/batch.test.ts` вже є ці два, їх треба оновити — вони зараз
закріплюють хибну поведінку:

- `planBatch` → `'groups two photos that really are the same picture'` очікує
  `['01-a-en.mp4', '02-b-en.mp4']` — лишиться правильним, бо там виділені всі.
- `planOne` → `'names it by its place in the batch, as the archive would'`
  очікує `'02-b-en.mp4'` — лишиться правильним.

Додати новий тест на власне баг:

```ts
it('numbers by grid position, not by position in the selection', () => {
  // Інакше той самий креатив дістає різне ім'я залежно від того, скільки фото
  // виділено — і два експорти однієї роботи розходяться.
  const project = apply(batchOf('a.jpg', 'b.jpg', 'c.jpg'), {
    type: 'photo/activate', id: 'p2',
  });
  expect(planBatch(project).groups.flatMap(g => g.items).map(i => i.name))
    .toEqual(['03-c-en.mp4']);
  expect(planOne(project, 'p2').groups[0]!.items[0]!.name).toBe('03-c-en.mp4');
});
```

### Як перевірити

`npm test`, далі в редакторі: завантажити 3–4 фото, клікнути третє, натиснути
«Експортувати цей креатив» і «Експортувати 1 × 1» — обидва файли мають прийти з
однаковим номером.

---

## Баг 2 — тіло POST дублює фото на кожен файл

**Складність:** зміна формату `BatchItem` — ядро, сервер і тести. Десь година.

### Що не так

`BatchItem` несе цілий `Spec`, а `Spec` несе зображення як data URL. На
максимальній пачці це 84 копії тих самих картинок в одному HTTP-запиті:

```
12 фото × 7 мов = 84 файли
одне фото як data URL: 0.56 МБ
POST body: 47.5 МБ
```

Ліміт `express.json` — 400 МБ (`src/server/index.ts`), тож воно проходить. Але
`JSON.stringify` на 47 МБ підвішує вкладку на пресі кнопки, і на важчих вихідних
фото (1080×1920 в хорошій якості — 1.5–2 МБ) це росте до 130–170 МБ.

### Чому це зайве

Сервер із `item.spec` читає **тільки три поля звуку**. Перевірено:

- `src/server/batch.ts:322` — `voiceFor`: `const { script, voiceId, modelId } = item.spec;`
- `src/server/batch.ts:290` — рендер бере `group.spec`, а не `item.spec`
- більше `item.spec` не читається ніде; у редакторі — теж ніде

Це й є визначення групи: **один візуальний Spec плюс N звукових доріжок**. Тип
має це казати, а не возити картинку 84 рази.

### Що зробити

**1. `src/core/batch.ts` — звузити `BatchItem`.**

```ts
/** Чим один файл у групі відрізняється від сусіднього: тільки звуком. */
export interface Sound {
  script: string;
  voiceId: string;
  modelId: string;
}

export interface BatchItem {
  photoId: string;
  locale: LocaleId;
  /** Як він називається в архіві. */
  name: string;
  sound: Sound;
}
```

`BatchGroup.spec` лишається як є — це те, що рендериться.

**2. `itemFor` (`src/core/batch.ts`)** має повертати `{ photoId, locale, name, sound }`,
але `group()` усе ще потребує `Spec`, щоб порахувати `visualKey` і покласти в
`group.spec`. Найпростіше — хай `itemFor` повертає пару `{ item, spec }`, а
`group()` бере її, хешує `spec` і кладе `spec` у групу лише для першого елемента.

**3. `src/server/batch.ts`:**
   - `voiceFor` → `const { script, voiceId, modelId } = item.sound;`
   - `validate()` (рядок ~106) варто підсилити: зараз він перевіряє наявність
     `group.spec` і непорожній `group.items`; можна додати перевірку, що в
     кожного елемента є `name` і `sound`.

**4. Тести `src/core/batch.test.ts`** — три місця посилаються на `item.spec`:
   - `'renders the group once and mixes the rest onto it'` — `i.spec.script` → `i.sound.script`
   - `'goes through the same plan a release does…'` — `plan.groups[0]!.spec` вже
     не буде тотожним `items[0].spec`; перевіряти замість цього, що `renders === 1`
     і що `groups[0].spec` існує
   - решта не чіпає `spec`

**5. Додати тест на власне економію:**

```ts
it('carries the photo once per group, not once per file', () => {
  // Інакше пачка 12 × 7 їде на сервер із 84 копіями тих самих картинок.
  const plan = planBatch(twoSilentLanguages());
  const wire = JSON.stringify(plan.groups);
  expect(wire.split('data:image/jpeg;base64,').length - 1).toBe(1);
});
```

### Як перевірити

Після зміни зміряти те саме, що зміряно вище — на 12 фото × 7 мов тіло має впасти
з 47.5 МБ приблизно до розміру самих унікальних відеорядів (для однакових фото —
менше мегабайта). Скрипт для заміру:

```js
const plan = planBatch(project);
const body = JSON.stringify({ groups: plan.groups, duration: project.duration, fitToVoice: true });
console.log('POST body:', (body.length / 1048576).toFixed(1), 'MB');
```

Далі — реальний експорт пачки на дві мови й перевірка, що озвучка лягла на
правильні мови (це головний ризик зміни: переплутати, чий `sound` до якого файлу).

---

## Не баги — свідомі обмеження, зафіксовані щоб не «виправити» їх випадково

**Текст шаблону більше не окремий на фото.** Override переїхав з `TemplateLayer`
на `Locale`, як прямо вимагає PRD (*«Override зберігається на Locale, не на
Photo»*, розділ «Ядро» → «Мердж текстів»). Наслідок: mixed-state для полів
шаблону з E4 зник — чотири виділені фото більше не можуть мати різні заголовки.
Для кнопок, кольору й геометрії mixed-state лишився. Це не регресія, а те, про
що просив PRD: офер належить пачці, а не кадру.

**Прев'ю показує задану тривалість, а не розтягнуту під озвучку.** Довжину
озвучки видно лише після синтезу, тож до експорту її знати нема звідки.
Перевірено, що сам розтяг працює: кнопка з відкритим кінцем лишається на кадрі
на 6.2 с у відео, яке озвучка розтягнула з 3 с (історія 54).

**Тимчасові теки задач не чистяться на виході сервера.** `sweep()` тримає шість
останніх завершених задач і видаляє старші, але лише коли стартує нова задача, і
нічого не прибирає на SIGINT. Обмежено сімома теками в системному temp — на
однокористувацький локальний інструмент прийнятно.

**Другий провайдер перекладу (Anthropic) і вшитий список із 18 голосів
ElevenLabs.** Рев'ю позначило їх як вихід за межі PRD (*«клієнти ElevenLabs і
DeepL»*). Лишені свідомо: `.env.example` рекламує `ANTHROPIC_API_KEY` ще з E1, а
робочий ключ ElevenLabs не має права `voices_read` — без вшитого списку
випадайка голосів порожня, і вибрати голос неможливо взагалі.
