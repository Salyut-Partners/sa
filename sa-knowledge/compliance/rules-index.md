---
status: зі-слів-партнера
source: raf_compliance, raf_article, finance_article
date: 2026-08-07
last_confirmed: 2026-06-01
---

# Комплаєнс — карта правил

33 атомарні правила провайдера. Кожне має власний `id` формату `CMP-NNN`.
Догори: [[index]]. Модель бізнесу, з якої вони випливають: [[rsoc-model]].

Усі правила несуть `status: зі-слів-партнера` — це вимоги провайдера, а не
наші висновки з практики. Джерело CMP-001…032 оновлено 1 червня 2026;
CMP-033 — з живого аудиту креативів 2 липня 2026.

## Спершу — практичний шар

Правила нижче кажуть, **що заборонено**. Ці чотири нотатки кажуть, **на чому
реально ловлять реджекти** — і на конкретне питання «чи можна так написати»
відповідають швидше:

- [[trigger-words]] — словник слів: instant, free, relocate, «за одну хвилину»,
  «доступні вакансії». Плюс те, що навпаки можна.
- [[first-person-ban]] — ⚠️ жодного «я» в креативі. Найчастіша причина
  переробки цілих пачок.
- [[ai-output-check]] — модель повертає першу особу при перекладі й розмиває
  формулювання.
- [[compliance-verification]] — вердикт виносить платформа, не ми; реджект
  читається як фідбек; правила плавають кожні 2–3 місяці.

Якщо питання про конкретне формулювання — починай звідси, а сюди повертайся за
формальним правилом.

## Головне правило

[[cmp-001-obicyanka-vykonuyetsya-na-lendingu]] — усе, що обіцяє креатив, має
виконуватись прямо на лендінгу. З нього випливають майже всі інші.

## Креативи

**Заклики й тон**
[[cmp-002-bez-diyevyh-cta]] · [[cmp-005-bez-instrukciy-klikaty]] · [[cmp-014-swipe-i-click-verbiage]]

**Твердження, обіцянки, гарантії**
[[cmp-003-tverdzhennya-pidtverdzhuyetsya]] · [[cmp-004-omanlyvi-garantiyi]] · [[cmp-015-nemozhlyvi-obicyanky]] · [[cmp-016-vydavannya-sebe-za-inshogo]] · [[cmp-017-obicyanky-poza-kontrolem]]

**Час і швидкість**
[[cmp-010-bez-obmezhenyh-u-chasi-oferiv]] · [[cmp-011-bez-shvydkogo-shvalennya]] · [[cmp-013-slovo-sogodni]]

**Ціни**
[[cmp-008-realistychni-ciny]] · [[cmp-009-bez-cin-na-avto]]

**Гео**
[[cmp-007-bez-geo-kopiyi]]

**Формати й зображення**
[[cmp-006-testimonialy-dozvoleni]] · [[cmp-012-ogolenist-i-prymanka]] · [[cmp-033-bez-pershoyi-osoby]] ⚠️

**Окремі вертикалі**
[[cmp-018-dental-medicare]] · [[cmp-019-garantovanyy-kredyt]]

Використання чужих брендів (Klarna, Medicare) у воронці — можна, представлятись
ними — ні: правило живе в [[advertiser-brands]], розділ «Брендування воронки».

## Стаття й лендінг

**Відповідність куту**
[[cmp-020-stattya-vidpovidaye-kutu]] · [[cmp-028-bez-zgadok-pro-zayavku-v-statti]]

**Якість тексту**
[[cmp-021-dovzhyna-ta-promt]] · [[cmp-022-spravzhni-abzacy]] · [[cmp-023-abzac-pered-rsoc]]

**Перший абзац і заголовок**
[[cmp-024-bez-slova-nyzhche]] · [[cmp-025-vkazivni-emodzi]] · [[cmp-026-bez-geo-v-zagolovku-statti]]

**Джерела й медіа**
[[cmp-027-dzherela-i-giperposylannya]] · [[cmp-029-zobrazhennya-ne-dlya-kreatyviv]]

## Фінансова вертикаль — жорсткіше

Фінанси мають окремий, суворіший набір. Якщо вертикаль фінансова — перевіряй
спершу ці три, потім загальні.

[[cmp-030-finansy-informaciynyy-ton]] · [[cmp-031-finansy-zaboroneni-formulyuvannya]] · [[cmp-032-finansy-dozvoleni-cta]]

## Пари «креатив ↔ стаття»

Кілька правил існують парами — одне з боку реклами, друге з боку статті:

| Креатив | Стаття | Про що |
|---|---|---|
| [[cmp-001-obicyanka-vykonuyetsya-na-lendingu]] | [[cmp-020-stattya-vidpovidaye-kutu]] | виконання обіцянки |
| [[cmp-002-bez-diyevyh-cta]] | [[cmp-028-bez-zgadok-pro-zayavku-v-statti]] | заявка й купівля |
| [[cmp-007-bez-geo-kopiyi]] | [[cmp-026-bez-geo-v-zagolovku-statti]] | геолокація |
