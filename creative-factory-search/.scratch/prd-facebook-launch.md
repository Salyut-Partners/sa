# PRD — Залив у Facebook і картинки з диска

**Status:** ready-for-agent

Узгоджено 2026-10-15 у сесії grilling. Доповнює `prd-quick-launch.md`: усе,
що там сказано про залив без стану, лишається в силі. Тут описано, що
змінюється, коли джерело Facebook і коли креатив є картинкою.

---

## Problem Statement

Байер заливає з редактора тільки в TikTok. У формі можна вибрати джерело
Facebook, але тоді залив складає тіла запитів за зразком TikTok і чесно
попереджає, що вони не звірені. На ділі FB-кампанія з редактора виходить
неправильною:

- профіль (TSP) має інші поля, тож FB його не прийме або прийме з
  іншою стратегією ставок;
- сторінка (FP) не підставляється взагалі, а на FB без неї оголошення
  не існує;
- піксель береться з рядка чужого кабінету;
- основний текст оголошення (primary text) лишається порожнім, хоча на FB
  саме його видно найбільше.

Тому FB-кампанії байер досі заводить руками в адмінці.

Друга проблема: у кампанію можна покласти лише відео, тобто рендер
редактора або mp4 з диска. Статичні картинки від дизайнера чи генератора
байер теж хоче заливати: завантажити файли й одразу залити, без озвучки,
шаблону й рендеру. Зараз так не можна ні в TikTok, ні в FB.

Окремо є тиха помилка в змішаних топіках, де вже є кампанії обох джерел.
FB-залив підставляє дефолти з TikTok-кампаній і може перевикористати
TikTok-профіль чи TikTok-headline як свій.

## Solution

Та сама вкладка «Залив», та сама модалка, та сама кнопка «Підтвердити», яку
натискає тільки людина. Коли в полі «Джерело» вибрано Facebook:

1. **Профіль** складається так, як його шле адмінка FB: стратегія ставок,
   ціль оптимізації, плейсменти, вік від/до, атрибуція. Атрибуція завжди
   «7-1-1» і у формі не показується.
2. **Старт** вибирається як «Одразу / Завтра о [час]». Для «Завтра» час за
   замовчуванням 00:00 за часом акаунта («з нулів»), і його можна змінити.
3. **Стратегія:** Bid Cap за замовчуванням, тоді лесенка бідів працює як у
   TikTok. Lowest cost (без капу) ховає колонку «бід». Cost per result goal (`COST_CAP`) бере бід як ціль за результат.
4. **Сторінка (FP)** обов'язкова. Підставляється так:
   - сторінка з останньої FB-кампанії сету;
   - якщо такої немає, остання сторінка, з якою байер заливав у бізнесі
     цього кабінету;
   - якщо й такої немає, байер вибирає сам.
   Сторінку чужого бізнесу залив не пропускає.
5. **Піксель** байер вибирає за назвою, один раз на бізнес. Під кожен рядок
   кампанії редактор сам бере рядок платформи, прив'язаний до цього
   кабінету.
6. **Primary text** — окреме поле під Headline, з дефолтом від останньої
   FB-кампанії сету. Description порожній. Перед підтвердженням байер
   бачить нагадування перевірити primary text за правилами `CMP-*`.

І для обох джерел:

7. **Картинки з диска** (jpg, png, webp) лежать у тому самому списку
   креативів, що й рендери та mp4. Кнопка «+ файли з диска» і
   перетягування приймають обидва типи. Картинка йде як є: без кропу, без
   стиснення, без тексту. Редактор показує прев'ю і пропорцію. Незвична
   пропорція для джерела дає попередження, але не блокує залив. Кожен
   креатив стає своїм оголошенням у кожній кампанії заливу.
8. **Змішані топіки:**
   - сети (термгрупа + стаття) показуються з кампаній обох джерел;
   - дефолти форми (піксель, сторінка, бюджет, бід, старт, поля профілю,
     headline) беруться тільки з кампаній того самого джерела;
   - профіль і headline перевикористовуються тільки свого джерела;
   - відео й картинка з тими самими байтами перевикористовуються з будь-якого
     джерела, бо платформа однаково мовчки ігнорує повторне завантаження.
9. **Командні дефолти** задаються окремо для кожного джерела. Для FB:
   бюджет 20, бід 0.3, крок 0.05, Bid Cap, Maximize Number of Conversions,
   Advantage+, вік 18–65+, старт «Одразу». Старий плаский формат конфігу
   вважається TikTok.

## User Stories

1. As a buyer, I want to pick Facebook as the source in the launch form, so that the same form launches FB campaigns as it does TikTok ones.
2. As a buyer, I want the FB profile sent in the shape the admin's FB form sends, so that the platform accepts it and builds the campaign I meant.
3. As a buyer, I want Click Attribution always 7-day click + 1-day engaged view + 1-day view, so that I never set it by accident to something else.
4. As a buyer, I want to choose the performance goal — Maximize Number of Conversions or Maximize Value of Conversions — with Number as the team default, so that I can test value optimisation when I need to.
5. As a buyer, I want Bid Cap to be the default bid strategy, so that the bid ladder across rows keeps working on FB.
6. As a buyer, I want to switch a launch to Lowest cost without a cap, so that I can let FB bid on its own when I test that.
7. As a buyer, I want the bid column hidden and no bid sent when the strategy has no cap, so that I don't think a bid applies when it doesn't.
8. As a buyer, I want campaigns that differ only in budget under Lowest cost to share one profile, so that the launch doesn't make profiles nobody needs.
9. As a buyer, I want to set the age as from/to (18 to 65+), so that FB targets the ages the admin offers.
10. As a buyer, I want to choose Advantage+ or Facebook Only placements, with Advantage+ as default, so that I can narrow placements when a creative only fits the feed.
11. As a buyer, I want to choose "start now" or "start tomorrow at a time", so that I can launch "from zero" at 00:00 account time.
12. As a buyer, I want the time to default to 00:00 when I pick "tomorrow", so that the usual "from zero" launch takes one click.
13. As a buyer, I want the start to be part of the profile, so that two campaigns with different starts get different profiles and never share a wrong one.
14. As a buyer, I want the modal to say plainly when an FB campaign starts — now, or tomorrow at HH:MM — so that I confirm the start I meant.
15. As a buyer, I want an FP to be required for an FB campaign, so that no FB campaign goes out without a page.
16. As a buyer, I want the FP of the set's latest FB campaign filled in, so that relaunching a set needs no clicks for the page.
17. As a buyer, I want, when the set has no FB campaign, the page I last launched with in the cabinet's business filled in, so that a new set still starts from my usual page.
18. As a buyer, I want the FP picked per row from the row's cabinet's business, so that several cabinets in one launch each get a page they can use.
19. As a buyer, I want a page from another business refused with a sentence naming both, so that I don't launch a campaign the cabinet can't run.
20. As a buyer, I want pages the platform lists without a business allowed, so that pages the platform hasn't linked yet still work.
21. As a buyer, I want to see each FB pixel once per business in the select, so that I pick «АВТО1», not one of three identical rows.
22. As a buyer, I want each row to get the platform's row of that pixel bound to the row's own cabinet, so that the campaign goes out with the pixel the cabinet really holds.
23. As a buyer, I want, when the cabinet has no row of that pixel but its business does, the launch to go ahead with a warning in the modal, so that I know it's untested and can check the first such campaign.
24. As a buyer, I want, when the business has no such pixel at all, the pixel of the same name in the business, or else an empty pixel for me to pick, so that a pixel never silently leaks from another business.
25. As a buyer, I want Latin pixel names (AUTO, LONS, loans, credit, JOBS, Job, ECOM) read as their niche like the Cyrillic ones, so that a new FB topic gets its niche's pixel filled in too.
26. As a buyer, I want a Primary text field under Headline on FB, so that I can spell out the creative's point in the ad's main text.
27. As a buyer, I want the primary text of the set's latest FB campaign filled in, so that relaunching keeps the text that worked.
28. As a buyer, I want the headline reused only when both its title and its primary text match what the topic holds, so that a changed text makes a new headline rather than reusing the old one.
29. As a buyer, I want the FB headline and primary text sent as a plain paragraph, as the admin sends them, so that the ad shows them as written.
30. As a buyer, I want a reminder before confirming to check the primary text against the CMP rules, so that a text likely to be rejected is caught before it costs a cabinet.
31. As a buyer, I want TikTok launches to work exactly as before, with no new fields, so that nothing I do daily changes.
32. As a buyer, I want to add jpg, png and webp images from disk beside renders and mp4s, so that I can launch static creatives with no voice and no template.
33. As a buyer, I want to drag images into the creatives area as I drag mp4s, so that adding them is the same gesture.
34. As a buyer, I want a file that is neither mp4 nor a supported image skipped with its name said, so that I know what wasn't taken.
35. As a buyer, I want a file whose bytes aren't really an image or a video refused, so that a renamed file doesn't break the launch halfway.
36. As a buyer, I want images uploaded as they are, so that the designer's file is what goes out.
37. As a buyer, I want a preview of each image and its proportion, so that I can see what I'm launching.
38. As a buyer, I want a warning when an image's proportion is unusual for the source (9:16 for TikTok; 9:16, 4:5, 1:1 or 1.91:1 for FB), so that I notice a wrong crop without being stopped.
39. As a buyer, I want no transcription for images and no script field on them, so that I don't wait for or fill in something images don't have.
40. As a buyer, I want images and videos mixed in one launch, each its own ad in every campaign, so that I can test static against video in one campaign.
41. As a buyer, I want an image the topic already holds — under its upload name or by its bytes under any name — reused, not sent again, so that a retry or a relaunch doesn't duplicate it.
42. As a buyer, I want the same image dropped twice uploaded once, so that the launch stays clean.
43. As a buyer, I want new images graded New like new videos, so that the repository marks new creatives the same way.
44. As a buyer, I want the modal to count images and videos from disk, so that I see what goes into the campaign.
45. As a buyer, I want images allowed on TikTok too, so that I can try static there; and I want to know that TikTok may refuse it or deliver it only on Pangle.
46. As a buyer, I want sets from both sources offered on a topic that has both, so that a set proven on TikTok can be launched on FB.
47. As a buyer, I want the defaults of an FB launch taken only from FB campaigns, so that a TikTok pixel, budget or start never lands in an FB form.
48. As a buyer, I want a TikTok profile or headline never reused for FB, and the other way round, so that each source's campaign is built from its own parts.
49. As a buyer, I want a video already uploaded for TikTok used as it is by an FB launch, so that the platform's silent drop of repeated bytes doesn't make the launch fail.
50. As a buyer, I want FB team defaults of budget 20, bid 0.3, step 0.05, Bid Cap, Number of Conversions, Advantage+, age 18–65+ and start now, so that a new FB set starts from the team's usual numbers.
51. As a buyer, I want to override team defaults per source in my config, so that my FB numbers don't change my TikTok ones.
52. As a buyer with the old flat config, I want it to keep working for TikTok, so that nothing breaks after the update.
53. As a buyer, I want the warning "bodies not checked" replaced by a specific list of what hasn't been checked on a live launch, so that I know exactly what to look at in the admin after the first test.
54. As the tester of the first FB launch, I want to launch one topic, one cabinet, starting tomorrow at 00:00, so that I can check the profile, builder, pixel and page in the admin before anything spends.
55. As a buyer, I want a retry after a partial failure to make only what's missing, on FB as on TikTok, so that a dead cabinet doesn't make the other campaigns twice.
56. As Claude, I want `sa show` to read a topic for either source with the same rules, so that what I tell the buyer matches what the form will offer.

## Implementation Decisions

**Платформа (зі знятих дампів, 2026-10-15)**

- *FB-профіль* — `POST /traffic-source-profiles`, JSON. Поля:
  - стала частина: `acb: 0`, `acb_budget_type: ""`, `acb_schedule: 0`,
    `budget_type: "Daily Budget"`, `schedule` — сім днів
    `{day, from: null, to: null, checked: false}`, `schedule_time_zone: ""`,
    `start_date: ""`, `lunch_tomorrow: 0`, `dynamic_creative: 0`,
    `quantity: 1`, `pixel_attribution: "7-1-1"`, `devices: ["All"]`,
    `device_os: null`;
  - змінна частина: `topic_id`, `traffic_source: "facebook"`,
    `performance_goal` (`MAXIMIZE_NUMBER_OF_CONVERSIONS` |
    `MAXIMIZE_VALUE_OF_CONVERSIONS`), `bid_strategy`
    (`LOWEST_COST_WITH_BID_CAP` | `LOWEST_COST_WITHOUT_CAP`), `budget`,
    `age_from` і `age_to` рядками (`"18"`, `"65"`, де 65 означає 65+),
    `gender`, `location`, `language`, `placements` (`advantage` для
    Advantage+), `end_date` (`0` — без кінця);
  - старт: «одразу» — `launch_time: null` і `launch_type` не надсилається;
    «завтра» — `launch_type: "tomorrow"` і `launch_time: "HH:MM"`. На FB
    `lunch_tomorrow` завжди 0.
- У відповіді на створення профілю тільки `success: true`. Id береться
  перечитуванням списку профілів, як уже зроблено для TikTok.
- *Читання профілю* — `GET /traffic-source-profiles/<id>`. Повертає ті самі
  поля, плюс `traffic_source`, `bid` числом і `device_os: "ALL"`. Під час
  розбору FB-профілю `device_os` не враховується. Розібраний профіль несе
  своє джерело, тож порівняння двох профілів враховує джерело і FB-поля.
- *Builder* для FB має ті самі поля, що й для TikTok
  (`POST /campaign-builder`). Змін не потребує, крім обов'язкового
  `page_id` для FB.
- *Сторінки FB* — `GET /facebook/pages`. Назва в `page_name`, бізнес у
  `business_id` (може бути null — тоді бізнес невідомий).
  Сторінки з `is_active: 0` не пропонуються.
- *Пікселі FB* — `GET /pixels?traffic_source=facebook`. Один FB-піксель
  (`ad_pixel_id`) лежить на платформі окремим рядком для кожного кабінету
  (`ad_account_id`). Модель пікселя несе `ad_pixel_id`.
- *Headline для FB* — `POST /creative-repo/headline`, `source=facebook`.
  `headlines`, `primary_texts`, `descriptions` йдуть одночасно простим полем
  і полем `[]`, кожен текст як `<p>…</p>` без `<strong>`. Для TikTok
  лишається `<p><strong>…</strong></p>`. Просте поле завжди дорівнює
  першому елементу списку.
- *Картинка* — `POST /creative-repo`, multipart, як відео:
  `media_type: Image`, справжній mime файлу (`image/jpeg`, `image/png`,
  `image/webp`), без поля `ad_script`, списки як `name[]`, файл у полі
  `file`. `grade: New`, як для відео; у дампі був `Strong`, вибраний в
  адмінці вручну.

**Модулі**

- *Чиста модель платформи.* Вміє складати тіла для обох джерел:
  - профіль: TikTok-тіло без змін, FB-тіло як описано вище;
  - headline: html потрібного джерела.
  Розбирає відповіді платформи для профілів, сторінок і пікселів. Розбір
  переїжджає сюди з клієнта, щоб його можна було тестувати. Розібраний
  креатив несе джерела, якими його позначено, а headline — свій primary
  text, де список їх віддає. Якщо список їх не віддає, вважається, що
  обмежень немає.
- *Чисте ядро заливу.* Знімок топіка знає, для якого джерела його читали.
  - `teamDefaults` бере конфіг і джерело. Для кожного джерела свій блок;
    плаский конфіг — це TikTok; ключ `source` верхнього рівня, як і раніше,
    вибирає джерело за замовчуванням.
  - У формі заливу з'являються primary text і FB-налаштування: ціль, стратегія,
    плейсменти, вік від/до, час старту. TikTok їх ігнорує.
  - `setsAndDefaults`:
    - сети збирає з будь-якого джерела;
    - країни бере з останньої кампанії сету будь-якого джерела;
    - решту дефолтів бере тільки з останньої кампанії свого джерела, далі з
      топіка того самого джерела, далі з командних;
    - видає список недавніх сторінок байера (спершу з топіка, потім з усіх
      його FB-кампаній) для підстановки FP.
  - `linksWanted` дочитує й найновішу кампанію свого джерела в кожному
    сеті.
  - `forCabinet` для FB:
    - піксель: той самий `ad_pixel_id` цього кабінету → той самий
      `ad_pixel_id` у бізнесі → та сама назва в бізнесі → порожньо;
    - сторінка: своя сторінка бізнесу → перша з недавніх у бізнесі →
      порожньо.
    - Командна сторінка за назвою на FB не застосовується.
    - Кабінет і піксель порівнюються за номером рекламного акаунта без
      префікса `act_`.
  - `launchSteps`:
    - перевіряє обов'язковий FP для FB;
    - попереджає, коли піксель не прив'язаний до кабінету рядка;
    - профілі групує за бюджетом і бідом, а без капу — тільки за бюджетом;
    - перевикористовує профіль і headline лише свого джерела;
    - перевикористовує медіа будь-якого джерела;
    - завантажує картинки з `media_type: Image` під ім'ям з тегом дайджесту
      й власним розширенням;
    - попередження «не звірено» стає конкретним переліком.
  - Словник ніш пікселів отримує латинські назви.
- *Сервер заливу:*
  - знімок читає сторінки й пікселі свого джерела;
  - кампанії байера дочитує, коли в топіку немає кампаній свого джерела
    (раніше — коли в топіку не було кампаній узагалі);
  - staging приймає mp4, jpg, png, webp і перевіряє сигнатуру байтів;
  - транскрипція тільки для mp4;
  - пошук «тих самих байтів» охоплює і відео, і картинки;
  - завантаження шле справжній mime.
- *Редактор:*
  - поля FB з'являються лише для Facebook: старт «Одразу / Завтра о», ціль,
    стратегія, плейсменти, вік від/до, Primary text;
  - колонка «бід» ховається без капу;
  - пікселі в селекті показуються без дублів за бізнесом і `ad_pixel_id`;
  - список креативів змішаний, картинки з прев'ю і пропорцією;
  - модалка показує старт, FB-поля, кількість картинок і нагадування про
    `CMP-*` для primary text.

**Що ще не звірено.** У коді й у модалці це позначено як непідтверджене. Усе
перевіряється на першому заливі.

- Значення `placements` для Facebook Only (беремо `facebook`).
- Чи надсилається `bid` рядком при Bid Cap. У прочитаному профілі він є,
  у знятому дампі створення — без капу.
- Чи віддає список creative-repo джерела запису й primary text.
- Чи прийме builder креатив, позначений іншим джерелом.
- Формат `account_id` кабінету в списку кабінетів (з `act_` чи без).
- Чи піде рядок пікселя сусіднього кабінету того самого бізнесу.
- Як TikTok обробляє статичну картинку.

## Testing Decisions

- Хороший тест перевіряє лише зовнішню поведінку: за знімком топіка, формою
  й файлами — які кроки, з якими тілами, що перевикористано, які помилки
  й попередження. За сирою відповіддю платформи — що з неї розібрано.
  Внутрішні допоміжні функції окремо не тестуються.
- **Шов 1 — чисте ядро заливу** (`setsAndDefaults`, `forCabinet`,
  `launchSteps`, `teamDefaults`). Тут:
  - FB-тіло профілю з обома стратегіями, обома стартами й віком;
  - групування профілів без капу;
  - обов'язковий FP і відмова сторінці чужого бізнесу;
  - вибір рядка пікселя під кабінет із попередженням про сусідній кабінет;
  - підстановка сторінки з недавніх;
  - фільтр джерела в дефолтах, профілях і headline;
  - перевикористання медіа між джерелами;
  - картинки: тип, ім'я, mime, без скрипта, повторна та сама картинка;
  - FB-headline з primary text і його повторне використання;
  - конфіг по джерелах і старий плаский;
  - латинські ніші;
  - TikTok-кейси не змінюються.
- **Шов 2 — розбір відповідей платформи**, перенесений у чисту модель.
  FB-профіль з `GET /traffic-source-profiles/<id>` (дамп 142169), сторінки з
  `GET /facebook/pages` (null-бізнес, неактивні), пікселі FB з
  `ad_pixel_id` на кабінет. Фікстури — урізані реальні дампи з цієї сесії,
  без токенів.
- Прецеденти: наявні тести ядра заливу і моделі платформи; фабрики знімка,
  форми й файлу з них розширюються, а не дублюються.
- Сервер, staging і редактор тестами не покриваються. Їх перевіряють
  typecheck і перший живий залив.

## Out of Scope

- Старт у конкретний день тижня (Monday…Sunday в адмінці). Додати просто,
  коли знадобиться.
- ROAS Goal, ACB+, AS+, розклад за днями, окремі налаштування Desktop/Mobile,
  dynamic creative.
- Description у FB-headline (лишається порожнім).
- Обробка картинок: кроп, ресайз, стиснення, зняття метаданих.
- Каруселі й кілька картинок в одному оголошенні.
- Автоматична перевірка `CMP-*` всередині редактора: це робить Claude
  скілом `compliance`, редактор лише нагадує.
- Командна FB-сторінка за назвою.

## Further Notes

- Перший FB-залив робить Вадим: один топік, один кабінет, «Завтра о 00:00».
  Потім у адмінці перевіряються профіль, builder, піксель і сторінка. Окремо
  так само тестується перший залив картинок у TikTok. Після успіху перелік
  «не звірено» скорочується, а `README` фіксує, що звірено.
- Картинки, згенеровані AI, можуть нести метадані C2PA; Meta їх читає і може
  показати на оголошенні позначку «AI info». Це варто знати під час
  перевірки тестової кампанії.
- Ідею «лояльний креатив, тригерний заклик у primary text» ми не
  підтримуємо: primary text модерують FB і review bot платформи. Тому
  редактор нагадує перевірити його за `CMP-*` до підтвердження.
- Токени платформи потрапили в чат із дампами. Їх треба перевипустити, а
  фікстури тестів зберігати без них.
