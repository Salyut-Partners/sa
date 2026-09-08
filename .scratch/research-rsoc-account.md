# Ресерч — як отримати RSOC/AFS-акаунт від Google

**Статус:** дослідження завершено, рішення за тобою
**Дата:** 2026-08-28
**Питання:** що потрібно для отримання RSOC-акаунту напряму від Google — вимоги, цифри, чи треба доводити «спеціалізацію», які реальні шанси; і що структурно означає «стати провайдером», щоб під тобою працювали інші команди.

**Як читати посилання.** Кожне твердження має джерело `[N]` і рівень довіри:
**P** — primary (сторінка Google, документ регулятора, подання до SEC),
**PP** — partner-primary (сайт або звітність самої компанії),
**C** — community/secondary — такі числа **явно позначені як непідтверджені**.

Усі сторінки Google звірені вручну 2026-08-28. Все, що фетчилося без логіну: текст усередині інтерфейсу AdSense і партнерських порталів перевірити було неможливо, і я його не вигадував.

---

## TL;DR

- **«RSOC-акаунту» не існує як окремої сутності.** У документації Google це **«Related search for content pages»** — один із трьох *Product-Integrated Features (PIF)* всередині **AdSense for Search (AFS)** [7]. «RSOC» — індустріальний сленг; у довідці Google цієї абревіатури нема. Те, що тобі потрібно, — **AdSense-акаунт із увімкненим AFS**.

- **Self-serve AFS закрито 17 травня 2022 року.** Google пише прямо: *«This feature is only available to eligible accounts created before May 17, 2022»*, і *«If you don't have the Search engine option, then you're not eligible»* [34]. Ця зміна **ніколи не анонсувалася в policy change log** — вона існує лише як примітка в одній довідковій статті. Тобто якщо твій AdSense-акаунт створено після травня 2022 — самостійно ввімкнути пошукову монетизацію ти не можеш **фізично**.

- **Єдиний задокументований шлях — акаунт-менеджер Google.** Три різні сторінки відсилають туди: *«reach out to your account manager to sign up»* [1], *«Contact your account manager to activate AdSense for Search»* + макет на рев'ю [6], *«Work with their Google AdSense account manager»* для RAF [2]. **Google ніде не документує, як отримати акаунт-менеджера.** Публічної форми заявки немає — на developers.google.com фраза «Apply for Custom Search Ads today» є **нелінкованим текстом**.

- **Rev-share Google для AFS опублікований і становить 51%:** *«For AFS, publishers receive 51% of the revenue recognized by Google»* [17]. Реструктуризація rev-share 2024 року AFS **не зачепила** [35]. Якщо ти йдеш через провайдера, він ріже **свою частку після Google** [36] — тому «80/20 на твою користь», яке ходить по блогах, це поділ частки провайдера, а не gross Google.

- **Google не публікує жодного порога для входу** — ні за обсягом, ні за спендом. Публікує пороги **для утримання**: понад **20 search ad impressions** мінімум у 2 з 6 попередніх місяців — інакше AFS відбирають [1]; понад **$10 000 виручки на місяць** у 3 з останніх 4 місяців — інакше відбирають Restricted Access Features (RAF), без яких RSOC урізаний до 5 термів, одного блока на сторінку і стилів за замовчуванням [2].

- **Формальної «спеціалізації» не існує.** Google Partners із бейджами — це рекламодавці й агенції, вхід туди через Google Ads manager account, до паблішерів відношення не має. Google Certified Publishing Partner — сервісні компанії для AdSense/Ad Manager, не канал доступу до AFS. Довести треба **policy compliance**: погоджений макет [6] і дотримання секції *«Acquiring traffic»* з обов'язковим `referrerAdCreative` — **дослівною повною транскрипцією креативу**, включно з мовленням у відео, текстом пісні й будь-яким текстом на екрані [6][7][21]. Це прямо стосується того, що робить твоя фабрика.

- **Прямий контракт для незалежної EU-команди у 2026 — дуже низька ймовірність, і ринок стискається.** Google прибрав AFD із Search Partner Network 10.02.2026 [37]; це вбило або випотрошило половину провайдерів. System1 у Q2 2026 має **going concern doubt**, партнерів **59 проти 133** роком раніше, і другу угоду з Google Google розірвав *for convenience* [11]. Inuvo сидить на **місячних продовженнях GSA** [13], Legacy Search **−80%** рік до року [12].

- **«Стати провайдером» під звичайним AdSense прямо заборонено.** ToS: *«Unless expressly authorized in writing by Google, you may not enter into any type of arrangement with a third party where that third party receives payments made to you… or other financial benefit»* — і довідка додає: *«we **rarely** give publishers permission»* [38][39]. Стандартний GSA також забороняє *«co-branding, white labeling or sub-syndication arrangement with any third party»* [15]. Провайдером стають через індивідуально виторгуваний виняток. **Реалістичний шлях до тієї ж економіки — sub-provider/white-label під наявним прямим партнером**; публічно такі тіри мають рівно двоє: **System1 CASE** і **Tonic «Publisher Networks»** (за окремим схваленням, умови не публікуються).

---

## 1. Що таке RSOC — точна таксономія Google

### 1.1 Родина продуктів

| Абревіатура | Назва Google | Що це | Доступ |
|---|---|---|---|
| **AFS** | AdSense for Search | **Продукт** [1] | Тільки через account manager [1]; self-serve закрито 17.05.2022 [34] |
| **CSA** | Custom Search Ads / Search ads | **Протокол**, через який AFS віддає оголошення. Дослівно: *«these policies apply to the use of Google's AdSense for Search (AFS) services through the Search ads (CSA) protocol»* [4] | Разом з AFS |
| **AFSh** | AdSense for Shopping | Shopping-оголошення; у scope разом з AFS і ProSE [40] | Через AFS |
| **ProSE** | Programmable Search Engine | Окремий пошуковий продукт, монетизований через AdSense | Залежить від того ж «Search engine» ad unit → фактично закрито для нових [34] |
| **AFD** | AdSense for Domains | Монетизація припаркованих доменів | **Мертвий:** *«Parked Domains (AFD) will cease to be an ad surface within the Search Partner Network effective February 10, 2026»* [37] |
| **SPN** | Search Partner Network | Мережа партнерських майданчиків. Google вживає її і для статусу паблішера: *«an account's status within the Search Partner Network»* [2] | — |

**«Custom Search Ads partner» — не термін Google.** Ця фраза не зустрічається на жодному домені Google. Власні формулювання Google — *«an AdSense account with active permission to use AdSense Custom Search Ads»* [5] і *«your account manager»* [1].

### 1.2 Де сидить RSOC

**Product-Integrated Features (PIF)** — три штуки [7]:
1. Ad intents
2. Related search for Auto ads
3. **Related search for content pages** ← це і є RSOC

**Alternative Search Queries (ASQ)** — чотири [10]: Popular Search, Suggested Search, Related Search *for search results pages*, Category Browse.

Критична деталь: фічу анонсовано 14.02.2022 [8], а до **15.11.2024** вона була ASQ і тільки тоді перейшла в PIF [21]. **Будь-який гайд, який посилається на сторінку ASQ як на правила RSOC, застарілий.**

Політика Search ads перелічує рівно три легальні джерела пошукового наміру [4]:
> Search ads may only be used on search results pages that were returned from clear user search intent coming from one of three sources: (1) a search query entered and submitted directly by a user into a search box…; (2) an AdSense for Search product-integrated feature…; (3) an Alternative Search Query…

RSOC — це шлях (2).

### 1.3 Три типи контракту — це і є відповідь на «що таке прямий акаунт»

Рішення Європейської Комісії у справі **AT.40411** документує внутрішню контрактну структуру Google [16]:

- **Google Services Agreement (GSA) з Direct Partners** — індивідуальна угода + **Order Form**, де прописані сервіси, список сайтів і **rev-share між Google і партнером**. Кожен Order Form підписують обидві сторони.
- **Online Contracts з Online Partners** — стандартні онлайн-умови AdSense, без переговорів.
- **Simplified Contracts** — проміжна форма 2009–2012; давала 0–5% чистої AFS-виручки Google у ЄЕП [16].

Google це підтверджує в чинних політиках: *«If your use of AFS is governed by the Google AdSense Online Terms of Service, Related search may only be placed on **Search ads enabled sites**»* [7], і в CSA-політиках згадує *«the applicable Google Services Agreement, Google AdSense Online Terms of Service, or any other relevant agreement»* [4].

**Отже «прямий акаунт» — це дві різні речі:**
- AFS під **Online ToS** — RSOC тільки на «Search ads enabled sites», і все одно через акаунт-менеджера;
- **GSA / Direct Partner** — те, що мають Team Internet, System1, Inuvo, IAC. Це і є «бути провайдером».

---

## 2. Як реально видається доступ

### 2.1 Що Google каже своїми словами

AFS, розділ «Sign up for AdSense for Search» [1]:
> If you think that your site may be a good fit for one or more of the features above, **reach out to your account manager to sign up**. We'll review your site and let you know when you can start using AdSense for Search.

RSOC, розділ «Requirements to use related search» [6]:
> To use related search on your content pages, you need to complete the necessary **contracting steps** for AdSense for Search (AFS). **Contact your account manager** to activate AdSense for Search for your AdSense account.
> After AdSense for Search is activated, **create a mock-up** that shows how you will implement your related search unit and **share it with your account manager for review**.

RAF, розділ «Who is eligible?» [2]:
> …accounts must: Have access to AdSense for Search in the AdSense interface. **Work with their Google AdSense account manager** to confirm/request access.

**Це замкнене коло.** Щоб отримати RAF, треба мати AFS в інтерфейсі. Щоб отримати AFS, треба акаунт-менеджера. Як отримати акаунт-менеджера — **не документовано ніде**.

### 2.2 Що є передумовою

- **AdSense-акаунт**: 18+, доступ до HTML сайту, володіння сайтом, контент *«high-quality, original, and attract an audience»* [22].
- **Google Ad Manager НЕ потрібен.** Навпаки: змішувати AFS із AFC/GAM/AdMob у одному плейсменті прямо заборонено [4].
- **Один акаунт на суб'єкта.** *«Operating more than one AdSense account per business entity is not permitted under the AdSense Terms»* [2]. Виняток: окремо зареєстрована організація може мати свій акаунт, за умови коректного типу акаунта і відповідності податкових/платіжних даних [24].
- **Юрисдикція.** Україна не входить до списку недоступних для AdSense країн за OFAC [25]. SEPA для України недоступний — це впливає на спосіб виплат, не на доступ. Провайдери майже завжди вимагають **юрособу**; Tonic прямо: *«Our services are aimed exclusively at and are provided exclusively for businesses… We do not conclude any contracts with consumers»* [41].

### 2.3 Єдиний self-serve виняток у родині AFS: Ad intents

**Ad intents — це AFS PIF** [7], але вмикається самостійно [23]:
> Sign in to your AdSense account. Click **Ads**. …make sure **Auto ads** is turned on. Click **Intent-driven formats**, and check the **Ad intents** checkbox.

Платить AFC rev-share, не AFS [23]. Це не замінює RSOC за економікою — але це легальна AFS-фіча без воротаря, чистий Policy center і реальна історія акаунта.

---

## 3. Вимоги і цифри

### 3.1 Числа з документації Google (**P**)

**Пороги утримання**

| Показник | Значення | Джерело |
|---|---|---|
| Збереження доступу до AFS | понад **20 search ad impressions** мінімум у **2 з 6** попередніх місяців, з 20.08.2025 | [1] |
| Збереження **RAF** | понад **$10 000 виручки/міс** у **3 з останніх 4** місяців, rolling | [2] |
| Ліміт запитів | **5 млрд** запитів на акаунт за рік (1 серпня – 31 липня) | [3] |
| Ліміт native style ID | **100** на акаунт, з 03.06.2026 | [42] |

**$10 000/міс — це не поріг входу, це поріг утримання RAF.** Але фактично він позначає планку, нижче якої RSOC технічно нежиттєздатний: без RAF у тебе 5 термів, один блок, тільки терми Google, дефолтні стилі.

**Rev-share (виправлено проти поширеної хиби)**

| Продукт | Частка паблішера | Джерело |
|---|---|---|
| **AFS** | **51%** від виручки, визнаної Google | [17] — *«For AFS, publishers receive 51% of the revenue recognized by Google»* |
| AFC | 80% після комісії платформи покупця; ≈68% коли попит з Google Ads | [36] |
| Через платформу-партнера | **додаткова частка знімається після частки Google** | [36] |

Реструктуризація rev-share 2024 року **AFS не зачепила**: *«The revenue share update affects AdSense for Content (AFC). This change does not affect AdSense for Search (AFS)»* [35].

⚠️ **Але 51% — це ставка за Online ToS.** У **GSA** rev-share узгоджується індивідуально в Order Form [16], і в поданих до SEC контрактах поля «AFS Revenue Share Percentage» і «AFS Deduction Percentage» **редаговані як конфіденційні** (`[*]`) [15]. Тобто у прямого партнера ставка інша, і вона непублічна.

**Система страйків RAF** [2][9]

| Подія | Наслідок |
|---|---|
| **10** in-scope порушень (lookback **180 днів**) АБО **1** «egregious» | 1 страйк |
| 1-й страйк | «Probation» **90 днів**, RAF зберігаються |
| 2-й страйк за рік | «Restricted» **90 днів**, RAF відібрані |
| 3-й страйк за рік | «**Revoked**» — RAF втрачені **назавжди** |
| Рік без страйків | усі страйки анулюються (крім Revoked) |

Страйки — **на рівні AdSense-акаунта, не сайту** [2]. Апеляція на страйк неможлива; апелюються тільки окремі порушення, і якщо апеляція виграна тому, що порушення *усунуто*, а не *спростовано* — страйк лишається [2].

**Що відбирають без RAF** [2]: максимум 5 термів; 1 RS unit на сторінку; тільки терми Google (**partner-provided terms вимкнені**); 500 reporting channels, перейменованих у «1…500»; стилі — ігноруються height/width, шрифти, іконки, колонки; дозволені лише margins ≤**2px**, borders ≤**1px**, ad separator ≤**1px**; click-tracking недоступний.

**Ліміти розміщення** [3][4]: максимум **2** AFS search boxes на сторінку; десктоп — максимум **3** ad units, **5** оголошень у блоці над/під результатами, ≤**1/3** видимої області без скролу, **8** збоку; мобайл — максимум **2** units, **1** видимий одночасно, **3** оголошення на блок; **кількість оголошень не перевищує кількість органічних результатів**; заборонено backfill через AFC/GAM/AdMob і навіть чергування типів запиту в тому самому плейсменті.

**Лейбли оголошень** [43]: *«Publishers may only label Google ads with either "Advertisements" or "Sponsored Links".»* — **«Ads by Google» у чинних політиках як дозволений лейбл не значиться.** Точні рядки бейджа, який малює сам `ads.js`, Google не публікує — документовано лише його стилізацію [44].

**Виплати** [18]: верифікація особи й адреси — **$10 / €10**; вибір методу оплати — **$10 / €10**; **поріг виплати — $100 (USD) / €70 (EUR)**; фінальна виплата при закритті — ~90 днів.

### 3.2 Структура ринку — числа регулятора (**P**)

З рішення ЄК AT.40411, дані надані самим Google [16]:

| Показник | 2007 | 2015 | 2016 |
|---|---|---|---|
| **Direct Partners** у ЄЕП (GSA) | **35** | **129** | **80–90** |
| **Online Partners** у ЄЕП | **10–20** | **8000–9000** | **7000–8000** |

> While Direct Partners account for only a small fraction of the total number of publishers using AFS, they generate most of Google's AFS revenues. For example, in 2016, Direct Partners generated net revenues in the EEA of **EUR 170–180 million**, representing approximately **70%–80%** of Google's net AFS revenues in the EEA in that year. [16]

⚠️ Рішення ЄК **скасоване** Загальним судом ЄС 18.09.2024 (T-334/19) [26] — скасовано **правову кваліфікацію** (Комісія не довела ефект витіснення), при цьому суд підтримав більшість фактичних висновків. Числа вище — фактичні дані Google, не предмет скасування. Але вони **датовані 2016 роком**; актуальніших публічних немає.

### 3.3 Числа партнерів — з їхньої власної звітності (**PP**)

**System1 (NYSE: SST), 10-Q Q2 2026, подано 05.08.2026** [11]:
- *«As of June 30, 2026, we had one paid search advertising partnership agreement with Google… in effect through September 30, 2027. We had a **second Google agreement**… but was **terminated for convenience by Google effective as of February 10, 2026**.»* (дата збігається з відключенням AFD [37])
- *«…may be terminated by either us or the respective Advertising Partner **immediately, or with minimal notice**.»*
- **Active Marketing Partners: 59** (Q2 2026) проти **133** (Q2 2025). Revenue per AMP — **$0,16 млн**/квартал.
- Marketing revenue: **$10,7 млн** проти **$54,1 млн** рік тому.
- **Going concern doubt.**
- Sub-syndication описана прямо: *«enabling third party publishers ("Network Partners") to monetize… Revenue is also earned from revenue-sharing arrangements with our Network Partners… we are the **agent**… report revenue on a **net** basis»*.

**Inuvo (NYSE American: INUV), 10-Q Q2 2026, подано 11.08.2026** [12]:
- Виручка H1 2026: **$15,46 млн** проти **$49,38 млн** (−68,7%). Legacy Search **−80%**.
- *«In response to more stringent compliance requirements, including **changes in the Google ecosystem which have suppressed revenue per click (RPC)**, and as a result of the detection of lower quality traffic on our systems, we developed and deployed an AI compliance system ("Ranger")…»*
- Штат **82 → 51** (−38%).
- GSA: продовжено на **3 місяці** (8-K 03.04.2026 [14]), потім ще на **1 місяць** з вилученням WebSearch Service (8-K 01.07.2026 [13]).

**Team Internet Group PLC** (материнська для TONIC. і ParkingCrew) — інвесторська сторінка описує Tonic дослівно як *«**Leading Google AFD & RSOC media buying platform**»* [45]. Це **найпряміше публічне підтвердження прямої лінії до Google у всьому ринку.** Регуляторний реліз RNS квантифікує залежність: *«In 2024, our Search segment generated $91 million in net revenue, of which approximately $72 million was derived from our **Google AFD relationship**»* [46] — тобто ~79% сегмента трималося на продукті, який Google вимкнув 10.02.2026.

### 3.4 Опубліковані вимоги провайдерів (**PP**) — їх у всьому ринку рівно дві

**TONIC. (Team Internet AG)** — найпрозоріший онбординг з усіх [47]:
- Спенд: *«after an initial testing phase, a **daily ad-spend in the four-digit range** shouldn't be a problem»* (тобто ≥$1000/день після тесту)
- Джерела: *«Currently we are allowing the following native networks: **Taboola, Outbrain, MGID and RevContent** as well as several leading social media platforms»*
- **Обов'язковий проміжний контент-лендінг для соц- і пошукового трафіку**: *«traffic coming from Social and Search cannot be sent directly to a ppc landing page, but needs to go through an intermediate content page first, that must be approved by our TONIC. Compliance Team **as well as our Tier1 feed provider**»*
- Якість: *«You should aim for **25%–60% CR**… If you notice that the CR is dropping below **10%** we advise you to immediately stop your campaigns»*. CR визначено як: користувач дійшов до ppc-лендінга і клікнув оголошення у видачі.
- SLA схвалення фід-провайдером: *«which takes **24h maximum**»*
- Гео: *«The main geos that work well… are most English-speaking countries, as well as **Europe** and most Asian countries»*; список винятків **не публікується**
- Вертикалі: *«We only restrict certain verticals if we see a substantiated risk»*; список **не публікується**
- Виплати [41]: NET-**45**, мінімум **$1000**, блокування коштів *«shall not exceed 120 days»*, і клоубек — якщо фід-провайдер тебе призупинить, *«Team Internet shall be entitled to retain and collect the balance on Publisher's Account as liquidated damages»*

**Iron Click** — єдиний, хто публікує поріг за обсягом [48]: *«Typically, **50,000+ clicks per month** are recommended, though smaller publishers may qualify depending on traffic quality.»*

**Sedo (SedoTMP)** [19][49]: заявка через форму, де обов'язкові назва компанії, адреса, країна, сайт (→ **юрособа фактично обов'язкова**) і поточна місячна виручка у бендах ($0–5k / 5–20k / 20–50k / 50–100k / 100–500k / >500k). **KYC обов'язковий і специфічний:** *«A portion of the SedoTMP Ad Hub compliance process requires Vendor to grant Sedo **access to Vendor's ad library** by connecting their traffic source accounts with Ad Hub… This step is mandatory.»* Виплати: щомісяця протягом 15 днів після закриття місяця, поріг **$500**.

**Rev-share не публікує жодна компанія ринку.** Нуль. Єдиний твердий якір — опубліковані Google **51%** для AFS [17], і частка провайдера ріжеться **після** цього [36].

### 3.5 Числа зі спільноти — **непідтверджені**

Наводжу з іменами джерел, бо вони гуляють і треба знати, чого вони варті.

| Твердження | Джерело | Оцінка |
|---|---|---|
| «Approval rate для нових RSOC-заявників ≈8% у 2025» | глосарій coinis.com [27] | **C**, першоджерела нема. Ігноруй |
| «Google бере ~20%, байер отримує 80%» | piratecpa.net [29] | **C** і **суперечить опублікованим Google 51%** [17] |
| «Бюджет від $150K, тільки на пошук зв'язки ~$10K» | traffhub.media [50] | **C**, непідтверджено |
| «Потрібна зарубіжна компанія + фінзвітність за півроку» | trafficcardinal.com [51] | **C**, частково збігається з вимогами Sedo/Tonic, але як вимога Google — непідтверджено |
| «$30 000 рекомендований мінімум на тест кейвордів» | cpa.rip [52] | **C**, непідтверджено |
| «Tonic бере від ~$3000/день» | undetectable.io [53] | **C**; **суперечить** власному FAQ Tonic («four-digit range» ≈ від $1000) [47] |
| «Мінімум $3k/день обороту, соло не візьмуть» | коментар на ban.media [54] | **C**, це коментар, не редакція |
| «3-strike RAF з 2-річним rolling window» | theoptimizer, clickflare [28] | **C, помилково** — Google каже 180 днів lookback, анулювання через 1 рік [2] |
| CR 25–60%, стоп нижче 10% | undetectable.io [53] | **C, але підтверджено** власним FAQ Tonic [47] — єдиний випадок, коли фолклор збігся з першоджерелом |

---

## 4. Policy compliance — що насправді означає «спеціалізація»

### 4.1 Формальної сертифікації не існує

- **Google Partners** — дослівно: *«The Google Partners program is designed for advertising agencies and third parties that manage Google Ads accounts on behalf of other brands or businesses»*, вхід вимагає **Google Ads manager account** [55]. Такої структури на боці паблішера просто немає. Вимоги виражені в **клієнтському спенді в Google** [56] — точна протилежність паблішерським відносинам.
- Google більше не вживає слово «specializations» — тепер це **certification areas** і тіри **Member / Partner / Premier Partner** [55]. Закритий список сертифікацій: Apps, Display, Search, Video, Shopping — *«**No other certifications count**»* [57]. Слів «AdSense», «publisher», «monetiz», «AFS» у цих документах немає взагалі.
- **Google Certified Publishing Partner** — акредитація для **сервісних компаній**, scope прямо обмежений *«Google AdSense and Google Ad Manager»* [30]. Не канал доступу до AFS.

**Отже: «спеціалізація» = policy compliance + погоджений акаунт-менеджером макет + партнер, який за тебе поручився.**

### 4.2 Платний трафік — дозволений, але з двома пастками

**Довідка дозволяє прямо** [58]:
> You're welcome to promote your site in any manner that complies with our program policies. However, AdSense publishers are **ultimately responsible for the traffic to their ads**.

І для RSOC окремо [6]:
> **Can I acquire traffic to my content pages with related search?** You may acquire traffic… provided that you comply with the "Acquiring traffic" section…

**Секція «Acquiring traffic» — головний документ для арбітражника** [7]:
> - the Traffic source's creative copy must be **passed verbatim and in its entirety** with the `referrerAdCreative` parameter…
> - Traffic sources must be **relevant to, and accurately describe**, what the user will see on the destination page.
> - Traffic sources **must not promise products, services, or promotional offers that are unavailable or are not easily found** on the destination page…
> - You must ensure that each destination page is **substantially the same as a page that would be displayed to a user arriving on the page through organic means**.
> - **You are responsible for any Traffic sources**, including any third party network, service or affiliate you partner with.

Четвертий пункт — це **анти-клоакінг для платного трафіку**. Окремої версії лендінга «під фейсбук» бути не може.

**Пастка 1: текст ToS ширший за довідку, і ToS має пріоритет.** AdSense Online Terms визначають invalid activity, включно з [38]:
> (ii) clicks, impressions, queries, conversions, or other events **solicited or generated by payment of money**, false representation, or requests for end users to click on Ads or take other actions

І там же: *«If ever in conflict, these Terms of Service will take precedence over any other terms in the policies and guidelines»* [38]. Довідкове прочитання — що йдеться про оплату **кінцевим користувачам**, а не про купівлю реклами. Але формулювання ширше за це прочитання, і саме воно контрактно старше. Це найгостріший некерований ризик у моделі RSOC на платному трафіку.

**Пастка 2: слово «arbitrage» у Google є — на боці рекламодавця.** Політика Google Ads «Insufficient original content» [59]:
> **Destination content that is designed for the primary purpose of showing ads.** Examples (non-exhaustive): Driving traffic through "**arbitrage**" or other methods to destinations with more ads than original content, little or no original content, or excessive advertising

Практичний наслідок: **якщо купувати трафік через Google Ads, ти одночасно стаєш рекламодавцем під цю статтю.** Купівля на Meta/TikTok/native її не тригерить. У паблішерських політиках слова «arbitrage» і «MFA» немає — там еквіваленти сформульовані як «low-value content» і «pages published specifically for the purpose of showing ads» [31].

**Загальні AdSense Program policies поверх усього** [31]: *«Clicks on Google ads must result from genuine user interest»*; заборона paid-to-click/paid-to-surf/autosurf/click-exchange; сайт має відповідати *Landing Page Quality Guidelines* — *«users should easily be able to find what your ad promises»*.
⚠️ Посилання на «Landing Page Quality Guidelines» у цій політиці **застаріле** — воно веде на статтю про Quality Score у Google Ads; документа під цією назвою більше не існує. Не цитуй його як чинний.

### 4.3 RAC — обов'язковий з 01.11.2025, і це робота для твоєї фабрики

Дослівно [6], з підсиленням у change log — *«Omitting to do so will be considered a policy violation»* [21]:
> …this parameter is required to be set to the **precise and complete creative text** of the advertisement or link source… "precise and complete creative text" signifies a **literal transcription**. For example, within an upstream **video** source featuring an influencer walking down a street, speaking to the camera, with background music also present, **the full transcript of the speech, the song lyrics, and any visible text on street signs**, among other elements that might appear anywhere on the user's screen, must be provided **verbatim and in their entirety**.

**Пряма проєкція на `creative-factory-search`.** Ти генеруєш відео з накладеною CTA-кнопкою, шаблоном офера й озвучкою по локалях. RAC для кожного mp4 = **транскрипт озвучки + весь текст на кадрі, тією ж мовою, дослівно**. Фабрика має віддавати це артефактом експорту поруч із відео, посегментно на кожну пару фото×локаль. Інакше — *«Inaccurate declaration of the referrerAdCreative»* [9].

Ще один пункт, який легко проґавити [6]:
> you should not make promises or claims based on **dynamic content at the destination that you do not control**… This can include ads, related search units or content feeds. The promise or claim must also be fulfillable on the destination page itself.

Тобто **обіцянка креативу не може виконуватися самим RSOC-юнітом чи оголошеннями**. Її має виконувати контент сторінки.

### 4.4 Таблиця «нормальне vs egregious» [9]

| Поведінка | Звичайне (10 = страйк) | **Egregious** (1 = страйк) |
|---|---|---|
| Некомпліант джерела трафіку | розмиті обіцянки: «Graduate education should be affordable! Let's go!»; «See a list of top doctors near you!» без реального списку | безкоштовне/готівка; обіцянка працевлаштування; нереально дешеві офери («нове авто за $1000»); обіцянка кредиту/зарахування; видавання себе за іншого («We're hiring drivers today!» якщо ти не кадрове агентство); обіцянки поза твоїм контролем |
| Оголошень більше, ніж органіки | органіка є, але оголошень більше | органіки нема взагалі, або вона нерелевантна |
| Розміщення юніта | нема заголовка; нема релевантного контенту над юнітом; «search now for the best offer», «click here»; стрілки | юніт — єдиний видимий елемент; контент прихований або потребує дії |
| Неточний RAC | сенс збережено: «Cheap cruises to the Bahamas for seniors» → «Affordable cruises to the Bahamas» | ключова деталь прибрана: «**Free** cruises» → «Cheap cruises»; «We're hiring, **$100/hr** IT Jobs» → «IT Jobs» |

**Заборонені типи сторінок для RSOC** [6]: без контенту або з малоцінним контентом; де оголошень більше, ніж контенту. Сторінка має *«provide sufficient standalone value to users»*.

**Google Publisher Policies** застосовуються до **всього контенту сторінки**, навіть без Google-оголошень на ній [7][32]. Категорії: illegal content, IP abuse, dangerous or derogatory, animal cruelty, misrepresentative content, enabling dishonest behavior, sexually explicit, compensated sexual acts, mail order brides, adult themes in family content, CSAE [32].

### 4.5 Що додає провайдер зверху — Sedo як зразок (**PP**)

Гайд Sedo v2.0 [19] — найдетальніший публічний документ про практичний компліанс. Прямо стосується твоїх шаблонів:

- **Три обов'язкові збіги:** креатив ↔ контент-сторінка; креатив ↔ ключові слова; креатив ↔ **AdTitle з URL**. *«The Adtitle (from URL) needs to be reflected perfectly on the Content Site and in the AdCreative»*, і **AdTitle обов'язковий** — його відсутність рахується подвійним mismatch.
- **Compliant:** informative, realistic, authentic, voluntary, neutral. **Non-compliant:** commercial purpose, overpromising, manipulative, incentivising/clickbait, sensitive topics.
- **«Зелені» формулювання:** *Read about, Learn more, might be, can do, Find more info, Discover how, Know more, Guide to, Info about, Article about, Read more.*
- **Кнопки:** «Learn more», «Discover more» — ок. **Кілька псевдо-CTA на одному креативі** («1 Bedroom → Search Now», «2 Bedroom → Search Now»…) — *«always incompliant»*.
- **Терм-блеклист:** **символи валют (€, $)**, сексуальний контент, зброя/насильство/hate, контрольовані речовини, foster care, **білизна/лінжері** (у зображенні, тексті або заголовку — *«always incompliant»*).
- **Здоров'я:** заборонено суїцид, обіцянки зцілення, назви препаратів, методи лікування й діагностики, медичні поради, залякування, «тести на захворювання». Дозволено: профілактика, well-being, life guidance.
- **Sub-ID механіка:** `{timestamp}, {visit_id}, {site}, {page_url}, {keyword}, {subid1}…{subid5}` + гео-макроси `{city}, {state}, {country}`.

**Це готовий чекліст валідації для редактора.** Перевірка тексту CTA/офера проти блеклиста і проти «зелених» формулювань — реальна фіча продукту, а не гігієна.

### 4.6 Технічна поверхня (**P**, developers.google.com)

Документація публічна, з приміткою: *«To use this code you must have an AdSense account with active permission to use AdSense Custom Search Ads»* [5].

Скрипт: `https://www.google.com/adsense/search/ads.js`; глобал `_googCsa`; два типи виклику — `_googCsa('ads', …)` і `_googCsa('relatedsearch', …)`.

Канонічний RSOC-виклик [5]:
```js
var pageOptions = {
  'pubId': '…',                       // client-ID без префікса 'partner-'
  'relatedSearchTargeting': 'content',// ОБОВ'ЯЗКОВО 'content' для RSOC
  'hl': 'en',                         // мова термів — критично для мультилокальності
  'styleId': '…',
  'resultsPageBaseUrl': '//www.example.com/search',
  'resultsPageQueryParam': 'query',
  'terms': 'term a,term b',           // partner-provided terms — RAF-фіча
  'referrerAdCreative': '…'           // обов'язково при керованому трафіку; required коли є 'terms'
};
var rsblock1 = { 'container': 'afscontainer1', 'relatedSearches': 6 };
_googCsa('relatedsearch', pageOptions, rsblock1);
```

**Пастка за замовчуванням.** `relatedSearchTargeting` має дефолт `'query'`, і Google прямо пише [5]:
> Misrepresenting the type of page or relying on the default 'query' setting for the `relatedSearchTargeting` parameter on non-search results pages is considered **a violation of these written instructions**.

Тобто забути виставити `'content'` — це **порушення політики, а не баг**.

Інше:
- **`query` НЕ використовувати** для RSOC — *«will cause unexpected results»* [5]
- **`ignoredPageParams`** — щоб краулер ігнорував tracking-параметри, user/session ID [5]
- **`rsToken`** у URL сторінки результатів — не видаляти, інакше ламаються funnel-метрики [6]
- **`termPositions`** у `adLoadedCallback` — які з твоїх термів Google реально взяв [6]
- **`adtest: 'on'`** — тестовий режим, імпресії й результати не рахуються [60]
- **Краулінг обов'язковий:** терми не з'являться, поки AdSense-краулер не проіндексує сторінку (~1 година; якщо 48 годин нема — до акаунт-менеджера) [6]
- Заборонено: кілька ad-запитів на сторінку (крім infinite scroll), приховування/переміщення блоків, маніпуляції DOM, власний lazy-load, кешування JS Google [5]
- **RSOC архітектурно — двоекранна воронка:** funnel requests/impressions/clicks рахуються на **першому екрані** (контент-сторінка з юнітом), **виручка — на другому** (SERP). `Funnel RPM` = виручка ÷ funnel impressions × 1000 [6]. `rsToken` зшиває екрани.

**Про `afdToken`:** у чинній публічній документації CSA його **немає**. Реальний задокументований токен — `rsToken`. `google.ads.domains.Caf` — це **інший продукт** (AdSense for Domains, `caf.js`), і Google **не публікує для нього документації взагалі**. Не плутай ці дві поверхні.

---

## 5. Реальні шанси

### 5.1 Структурна оцінка

1. **Direct Partner tier історично — ~сотня компаній на весь ЄЕП**, і вона вже скорочувалася: 129 (2015) → 80–90 (2016) [16].
2. **Self-serve закрито з 17.05.2022** [34], публічного онбордингу немає, форми заявки немає.
3. **2026 — рік стиснення.** AFD прибрано з SPN 10.02.2026 [37]. Inuvo — помісячні продовження GSA і вирізання сервісів [13][14]. System1 — *termination for convenience* по другій угоді і going concern [11]. Team Internet втратив продукт, який давав ~79% net revenue Search-сегмента [46].
4. **Жорсткі фільтри утримання:** 20 імпресій [1], $10k/міс для RAF [2], безповоротний Revoked [2].
5. **Причина названа партнером вголос:** *«more stringent compliance requirements… changes in the Google ecosystem which have suppressed RPC»* [12].

### 5.2 Чесна оцінка

Це **моя оцінка, не факт із джерела.** Жодної заяви Google про припинення прийому нових AFS-партнерів я не знайшов і не стверджую цього.

- **Прямий GSA (Direct Partner) для незалежної EU-команди протягом 12 місяців, без великої власної O&O-власності і без чинного контакту в Google: одиниці відсотків.** Немає жодного з активів, які Google оцінює на цьому рівні: власного органічного трафіку, юрособи з історією, обсягу, що виправдовує виділеного менеджера.
- **AFS під Online ToS з RSOC:** вища, але впирається в того самого акаунт-менеджера. Реалістично — через інтро від партнера.
- **Ad intents self-serve: 100%, сьогодні** [23]. Не замінює RSOC економічно, але це реальний AFS-доступ без воротаря.
- **Робота через feed-провайдера як паблішер: висока.** Стандартний вхід.

І контекст, який важливіший за саму ймовірність: **навіть отримавши прямий доступ у 2026, ти отримаєш гіршу економіку, ніж була у 2024–2025, і всю концентрацію ризику на себе.** Дві публічні компанії з прямими контрактами втратили 60–80% виручки за рік.

### 5.3 Карта ринку — верифікована

Перевірено повнотекстовим пошуком по SEC EDGAR: за 2024–2026 єдині публічні компанії США з Google Services Agreement у поданнях — **Inuvo, IAC/People Inc. і Zedge** [33]. Це не весь світовий ринок (приватні компанії туди не потрапляють), але показує масштаб: прямий контракт — рідкість навіть серед публічних компаній.

**Google не публікує списку AFS/RSOC-партнерів.** Перевірено: єдиний публічний партнерський каталог — Certified Publishing Partner, і його scope прямо обмежений AdSense + Ad Manager [30]. Тому «офіційний партнер Google» — твердження, яке ти **не можеш перевірити з боку Google**.

**Індустрія свідомо уникає слова «Google».** Домашній стиль — *«Tier1 feed provider»* (Tonic, ParkingCrew, Ads.com), *«the world's largest search feed»*, *«direct from major search engines»*, *«premium relationships»*. Це не випадковість: у GSA прямо прописано, що згадка Google Brand Features у vendor lists потребує письмової згоди Google [15].

**Живі й релевантні**

| Компанія | Доказ зв'язку з Google | Опубліковані умови | Sub-provider тір |
|---|---|---|---|
| **TONIC.** (Team Internet AG, Мюнхен, HRB 200081) | На власному сайті — тільки *«Tier1 search feed provider»*; **на інвесторській сторінці материнської компанії — прямо: «Leading Google AFD & RSOC media buying platform»** [45], а RNS квантифікує: $72M з $91M net revenue Search-сегмента 2024 з *«Google AFD relationship»* [46] | Найдетальніші на ринку [47][41]: ≥4-значний денний спенд після тесту; Taboola/Outbrain/MGID/RevContent + соцмережі; обов'язковий проміжний контент-лендінг з подвійним схваленням; CR 25–60%, стоп нижче 10%; 24h схвалення фідом; B2B only; NET-45, мін. $1000, клоубек | **«Publisher Networks» — за попереднім схваленням.** За замовчуванням заборонено: *«Publisher may use the Platform only for its own purposes… does not include the use… for and/or on behalf of third parties… and/or for the monetization of third-party Traffic»* [41] |
| **System1** (NYSE: SST) | **Найпряміша заява на власному сайті:** *«Our longstanding partnerships with **Google**, Bing and Yahoo…»*; *«20+ years of Google partnership»* [61]. Технічна документація підтверджує операційно: *«Compliance parameters such as `compkey` and `ref` are **required for Google monetization**»* [62] | Мінімуми/спенд/вертикалі/гео — **не публікує**. Єдиний критерій: *«partners with quality traffic and organic, typed-in searches»* [61] | **ТАК — CASE, white-label search feed** [61]: *«a powerful new white-label search feed that's now accepting applications»*, *«Built for browsers, apps, extensions, and websites»* |
| **Sedo / SedoTMP** (Sedo GmbH / Sedo.com LLC) | RSOC-продукт підтверджено [49]; власний compliance-гайд цитує політики Google RAF/RSOC [19]. **Прямим партнером себе не називає** — контракт каже лише *«the relevant Sedo advertising feed provider»* | Заявка через форму: юрособа обов'язкова, бенди виручки; **обов'язковий доступ Sedo до твоєї ad library** через Ad Hub; виплати щомісяця +15 днів, поріг **$500** [19][49] | Немає |
| **ExplorAds** (ExplorAds Ltd., Лімасол, Кіпр) | **Жодної згадки Google на власному сайті.** RSOC-статус тримається лише на community-джерелах | Відкрита self-serve реєстрація; мінімуми/вертикалі/KYC — **не публікує**. ⚠️ Публічні T&C — це EULA для браузерного розширення, не паблішерський договір | Не публікує |
| **Iron Click** | *«direct N2S feeds from Yahoo & Bing and **RSOC from Google**»* — «direct» зарезервовано для Yahoo/Bing, Google лише перелічено → читається як ре-синдикатор | **Єдиний, хто публікує поріг обсягу: «50,000+ clicks per month»** [48] | Не публікує |
| **Above.com** (Мельбурн) | RSOC-рішення для доменів; звітність через AdSense-платформу | **Контрактно непридатний для тебе:** прямо забороняє *«**Paid traffic of any kind/arbitrage**»*, *«Traffic sourced from networks or methods commonly associated with arbitrage»* [63] | Немає |

**Мертві або нерелевантні** (це половина списків, які циркулюють у спільноті):

- **Bodis** — припинив діяльність **31.01.2026**, сайт не відповідає. **Ads.com** — дочірня компанія Bodis; продукт зник, домен тепер одностраничка *«Coming soon: APEX»*. **Domain Active** — фід вимкнено в липні 2025, портал без DNS; причина в їхньому ж повідомленні партнерам: *«circumstances outside of our control involving Google and other factors»*.
- **CodeFuel** — бренд-сайт більше не існує, всі URL 301 на perion.com; вцілілий продукт орієнтований на **Microsoft Bing / MSN / Yahoo**, Google не згадується.
- **Media.net** — це **Yahoo!/Bing**, не Google: *«Unique Yahoo! Bing search demand»*; власні правила вимагають *«traffic primarily from organic sources»* і забороняють ресейл інвентарю.
- **Verve** — мобільна RTB SSP+DSP, до AFS/RSOC відношення не має взагалі.
- **Adcore** — buy-side агенція/SaaS; її партнерський статус з Google — **на боці рекламодавця**. White-label у неї є, але це агенційне виконання, не суб-синдикація фіда.
- **Crisp Results** — не та компанія: реальний бізнес під цією назвою був страховим lead-gen (Crisp Marketing LLC), поглинутий Digital Media Solutions у 2021.
- **Xitrum, Ascend, Apollo/AdPump** — існування в цьому ринку **підтвердити не вдалося взагалі**.

**Причина більшості смертей одна: відключення AFD 10.02.2026** [37].

**Корисний артефакт:** у заявочній формі Sedo випадайка «main feed provider» перелічує — **Sedo, TONIC, System1, Ads.com, Domain Active, ExplorAds, Inuvo, Other** [49]. Це погляд самого Sedo на те, хто конкуренти.

---

## 6. Стати провайдером самому

### 6.1 Що каже контракт — під обома режимами

**Під Online ToS суб-синдикація прямо заборонена.** AdSense Online Terms [38]:
> **Unless expressly authorized in writing by Google, you may not enter into any type of arrangement with a third party where that third party receives payments made to you under the AdSense Terms or other financial benefit in relation to the Services.**

Довідка розшифровує, що саме забороняється [39]:
> - Accounts that display their ads on and then share revenue with sites that are **owned and operated by third parties**.
> - Accounts with **affiliate or partner programs** that distribute a portion of their AdSense revenue with their third party partners.
> - Accounts that share revenue with a third party partner in payment for **services, traffic generation, ad impressions, etc.**

І — головне речення для твого питання:
> There are many risks when partners distribute revenue earned by their AdSense account to third parties. First and foremost is that we tend to see **higher rates of invalid click and impression activity** with these accounts… For this reason, **we rarely give publishers permission** to distribute their AdSense earnings with third party partners.

**Під GSA — так само.** Стандартний шаблон Google Services Agreement, §3.1 Policy Obligations [15]:
> Company will not, and will not knowingly or negligently allow any third party to: … (g) **enter into any type of co-branding, white labeling or sub-syndication arrangement with any third party in connection with any Results or Ad revenue**, `[*]` ;

Кінцівка `[*]` редагована як конфіденційна — там імовірно умова на кшталт «without Google's prior written consent», але **я цього не знаю і не стверджую**.

**Висновок: суб-синдикація за замовчуванням заборонена в обох режимах.** System1 і Team Internet роблять це не тому, що це дозволено, а тому, що мають виторгуваний виняток.

### 6.2 Інші контрактні механізми GSA, які варто знати [15]

- **Сайти затверджуються поштучно** — «Sites» це URL з Exhibit A плюс URL, схвалені Google згодом; запуск на новому сайті тільки після письмового схвалення імплементації.
- **Зміна контролю над сайтом = сайт випадає з угоди.**
- **Мінімальний поріг виручки на розрив:** Google може з повідомленням за 30 днів розірвати угоду, якщо місячна валова AFS+AFC Ad Revenue падає нижче `[*]` (редаговано).
- **Індемніті на компанії** — вона відшкодовує Google усі претензії з її контенту, сайтів або порушення угоди.

Шаблон датований 2010; поправка Inuvo 2026 показує, що структура жива і **посилюється**: у GSA додали визначення «RAF Policy» і «Restricted Access Feature», а §3.2 Compliance Obligations переписали так [14]:
> Company will not knowingly or negligently allow any use of or access to the Services through any Site that is not in compliance… Company will **use commercially reasonable efforts to monitor** for any such access or use…

Тобто **Google контрактно поклав на партнера обов'язок поліцювати свою downstream-мережу**.

### 6.3 Що агрегатор реально експлуатує

1. **Sub-ID трекінг і репортинг** — Sedo віддає `{subid1}…{subid5}`, `{visit_id}`, `{keyword}`, `{site}`, `{page_url}` [19]. Мінімум, щоб розділити виручку.
2. **Виплати й агентський облік** — System1 звітує виручку від Network Partners **net**, бо є агентом [11]. Це має прямі податкові й бухгалтерські наслідки.
3. **Compliance-поліція downstream** — Inuvo побудувала окрему AI-систему «Ranger» [12]. Tonic вимагає, щоб **кожен** проміжний контент-лендінг схвалили і їхній compliance-відділ, і фід-провайдер [47]. Sedo вимагає **доступ до твоєї ad library** [19].
4. **Готовність обрізати власну виручку заради чистоти** — Inuvo: *«it also necessitated that we intentionally constrain Bonfire-related revenue»*, ціною 80% Legacy Search [12].
5. **Клоубеки вниз по ланцюгу** — Tonic: якщо фід-провайдер тебе призупинить, вони *«shall be entitled to retain and collect the balance on Publisher's Account as liquidated damages»* [41]. Провайдер перекладає ризик на паблішера контрактно.

### 6.4 Концентрація ризику — головний аргумент проти

- **Страйки на рівні AdSense-акаунта, не сайту** [2]. Одна команда downstream із egregious-порушенням (креатив «Free cruises» з RAC «Cheap cruises») приносить один страйк **усьому акаунту**.
- **Три страйки за рік = Revoked назавжди**, без апеляції на страйк [2].
- **Google може призупинити сервіси одностороннім повідомленням**; System1 фіксує, що угоду можна розірвати *«immediately, or with minimal notice»* [11].
- ToS окремо визначає як invalid activity події *«occurring on a Property associated with another AdSense Account you use»* [38] — тобто ризик перетікає між пов'язаними акаунтами.

Економіка провайдера — це **брати частку з чужої виручки в обмін на прийняття ризику знищення всього бізнесу за дії людини, яку ти не контролюєш.**

### 6.5 Порівняння шляхів

| | **Прямий GSA (Direct Partner)** | **Sub-provider / white-label під партнером** |
|---|---|---|
| Час до запуску | 12–24+ міс за наявності контакту; публічного процесу нема [1][6][34] | тижні–місяці |
| Капітал | висока: юрособа з історією, юристи під GSA, compliance-команда, інженерія (краулінг, RAC-пайплайн, sub-ID, білінг) | низька–середня: трекінг, звітність, менеджмент команд |
| Потрібний обсяг | Google не публікує; орієнтир знизу — **$10k/міс** для утримання RAF [2] | задає провайдер; Tonic ≥4-значний денний спенд [47], Iron Click 50k кліків/міс [48] |
| Rev-share | 51% за Online ToS [17]; у GSA — індивідуально, редаговано [15][16] | ніхто на ринку не публікує; тільки NDA-розмова |
| Суб-синдикація | **за замовчуванням заборонена** [15][38][39]; потрібен виняток | вже вирішена на рівні провайдера |
| Публічно доступні тіри | — | **System1 CASE** [61]; **Tonic Publisher Networks** (за схваленням, умови не публікуються) [41] |
| Концентрація ризику | **максимальна**: страйк на весь акаунт, Revoked назавжди [2], розрив з мінімальним повідомленням [11] | розділена: ризик відключення від провайдера, не знищення акаунта |
| Що видно зараз | Inuvo −80% Legacy Search, місячні продовження [12][13]; System1 going concern, 133→59 партнерів [11] | той самий ринковий тиск, без контрактної відповідальності перед Google |

---

## 7. Конкретні кроки

Вихідна позиція: працююча фабрика креативів, платний соціальний трафік, EU-локалі (en/de/it/es/fr/nl/pl), поки без монетизаційного акаунта.

### Крок 0 — юридична база (тиждень)
- Зареєстрована юрособа. Провайдери це вимагають фактично всі: Tonic — B2B only [41], Sedo — назва/адреса/країна компанії в заявці [49]. Україна для AdSense доступна [25].
- Один AdSense-акаунт на суб'єкта [2][24]. **Не заводь другий — це підстава для блокування, і ризик перетікає між пов'язаними акаунтами** [38].
- **Рішення:** якщо мета — колись прямий GSA, EU-юрособа з VAT і банком у ЄС спрощує і виплати, і сприйняття.

### Крок 1 — увімкнути Ad intents уже зараз (день)
- Auto ads → Intent-driven formats → Ad intents [23]. AFS PIF, self-serve, AFC rev-share.
- **Мета не гроші, а слід:** чистий Policy center, історія, доказ що вмієш тримати сайт compliant.
- **Метрика:** нуль enforcement'ів у Policy center за 90 днів.

### Крок 2 — контент-сайт, який витримує рев'ю (2–4 тижні)
Проєктуй одразу під вимоги:
- Достатньо текстового контенту; заголовок є; релевантний контент **над** RSOC-юнітом [6][9].
- Сторінка для платного трафіку **substantially the same**, що й для органічного [7]. Жодних cloaking-версій — це прямо egregious.
- Якщо ти нічого реально не продаєш — тільки інформаційний контент, і креативи можуть обіцяти тільки інформацію [6][19].
- Не блокувати AdSense-краулер; налаштувати `ignoredPageParams` під tracking-параметри [5].
- Врахувати вимогу Tonic (якщо йдеш до них): соц- і пошуковий трафік **не можна** вести напряму на ppc-лендінг, тільки через проміжну контент-сторінку з подвійним схваленням [47].
- **Метрика:** сторінка проходить чекліст з §4.4/§4.5 без винятків.

### Крок 3 — RAC-пайплайн у фабриці креативів (робота в цьому репозиторії)
Це те, що відрізнить тебе від 90% команд, і саме там, де твій продукт майже стоїть.
- На експорті кожного mp4 (фото × локаль) генерувати **RAC-текст**: транскрипт озвучки + весь видимий текст кадру (CTA, шаблон офера, підписи), тією ж мовою, дослівно [6][21].
- Прокидати рядок у `referrerAdCreative` через URL лендінга, посегментно на креатив. Пам'ятай: `referrerAdCreative` **обов'язковий**, коли передаються `terms` [5].
- **Валідатор** тексту CTA/офера: блеклист (символи валют €/$, здоров'я-тригери, білизна, зброя, речовини) + whitelist «зелених» формулювань [19].
- Заборонити в шаблонах кілька псевдо-CTA на одному креативі [19].
- Врахувати, що `hl` треба виставляти під локаль — терми мають бути мовою креативу [5].
- **Метрика:** 100% експортів мають непорожній валідований RAC; нуль креативів з блеклист-термами.

### Крок 4 — вибрати провайдера (2–4 тижні)
Шорт-лист за верифікованими даними: **TONIC.** (найкращий доказ прямої лінії до Google, найпрозоріший бар, найжорсткіший контракт), **System1** (найясніша заява + єдиний публічно рекламований white-label — CASE), **Sedo** (реальний RSOC-продукт, обов'язковий Ad Hub KYC, поріг $500, але материнська IONOS, за повідомленнями, продає бізнес — перевір це в розмові). Нижчий бар входу: **ExplorAds**, **Iron Click**. **Above.com не розглядай — він контрактно забороняє платний трафік** [63].

Питання, які ставити **до підписання**, і відповіді фіксувати письмово:
1. Під яким контрактом ви віддаєте фід — GSA напряму з Google чи через посередника? Скільки ланок до Google?
2. Яка ваша частка і від чого рахується? (Опорна точка: Google платить **51%** за AFS [17], провайдер ріже після цього [36]. Питай кінцеву цифру до тебе і від чого база.)
3. Чи є у вас **RAF-доступ** — >5 термів, кілька юнітів, partner-provided terms, click-tracking? Це прямо визначає стелю RPM [2].
4. Хто передає RAC — ви чи я? У якому форматі? Що буде зі мною, якщо страйк отримаєте ви?
5. Sub-ID: скільки рівнів, які макроси, яка гранулярність?
6. Пороги виплат, частота, валюта, holds, **клоубеки** — і за яких умов ви утримуєте баланс?
7. Які вертикалі й гео заборонені понад Google-політики? (Ці списки ніхто не публікує — треба питати.)
8. Чи є **white-label / sub-provider tier**, які його умови? (підготовка кроку 6)

### Крок 5 — набрати доказову базу (3–6 місяців)
- **Обсяг:** monetizable sessions / funnel impressions на місяць, у розрізі гео і локалі.
- **Якість:** **Funnel RPM** [6]; CR прелендер→фід (орієнтир Tonic: **25–60%**, стоп нижче **10%** [47]); частка сесій з >1 взаємодією.
- **Compliance:** policy-нотифікацій = **0**; частка креативів, знятих на модерації провайдера; частка з валідним RAC = 100%.
- **Економіка:** маржа по локалях, стабільність тижнів.
- **Точка рішення:** стабільні **>$10 000/міс виручки** [2] і нуль порушень — це перший момент, коли розмова про підвищення статусу взагалі має сенс. Нижче цієї планки Google сам позначив тебе як неактивного партнера.

### Крок 6 — масштабування через команди (після кроку 5)
Не намагайся спочатку стати провайдером — це інверсія ризику.
- Спершу: **sub-provider tier у свого провайдера**. Публічно доступні саме два: **System1 CASE** [61] і **Tonic «Publisher Networks»** за попереднім схваленням [41]. У System1 подача через CASE@system1.com; у Tonic це не рекламується — треба питати акаунт-менеджера.
- Незалежно від шляху доведеться побудувати: sub-ID репортинг, розрахунки з командами, **власну модерацію креативів до запуску**. Саме те, що Inuvo довелося робити як «Ranger» вже після проблем [12].
- **Твоя структурна перевага:** фабрика креативів дозволяє валідувати креативи **на етапі генерації**, а не постфактум у трафіку. Жоден із перевірених провайдерів цього не має — вони всі модерують після факту.
- **Точка рішення на прямий GSA:** розглядати лише коли є (а) EU-юрособа з історією і аудитом, (б) стабільні шестизначні місячні обсяги, (в) власна модерація з доказовою метрикою, (г) готовність узяти на себе ризик Revoked за чужі дії [2]. Без (г) прямий контракт — погана угода, а не приз.

### Що НЕ робити
- Не заводити другий AdSense-акаунт на ту саму особу/юрособу [2][24][38].
- Не купувати «готові RSOC-акаунти» — власник = сторона AdSense Terms, передача не передбачена, страйки прив'язані до акаунта [2].
- Не ділити виручку AdSense із третіми сторонами без письмового дозволу Google — дозволи *«rarely»* [38][39].
- Не скорочувати RAC «щоб краще заходило» — це прямо описаний egregious-приклад [9].
- Не робити окрему версію лендінга під платний трафік [7].
- Не покладатися на дефолт `relatedSearchTargeting` — забути `'content'` це порушення, не баг [5].
- Не ставити символи валют і ціни в CTA-кнопки [19].
- Не купувати трафік **через Google Ads** на RSOC-сторінку без окремої перевірки — це підводить тебе під рекламодавчу статтю про «arbitrage» [59].

---

## Що не вдалося підтвердити

| Твердження | Статус | Що б це закрило |
|---|---|---|
| Як отримати Google account manager для AFS | **Не документовано публічно взагалі.** Три сторінки Google відсилають туди, жодна не пояснює як [1][2][6] | Відповідь Google Sales або інтро від чинного партнера |
| Rev-share у GSA (прямого партнера) | Опубліковано лише ставку Online ToS — 51% [17]. Контрактні Revenue Share / Deduction Percentage **редаговані** [15] | Тільки власний контракт |
| Чи є в §3.1(g) GSA застереження «without Google's prior written consent» | Редаговано `[*]` [15] | Нередагована версія GSA |
| Мінімальний поріг виручки на розрив GSA | Редаговано `[*]` [15] | Те саме |
| Чи припинив Google приймати нових AFS-партнерів | **Жодної заяви Google не знайдено.** Висновки §5 — інтерпретація непрямих сигналів | Офіційна заява Google |
| Скільки Direct Partners у Google **зараз** | Останні публічні дані — **2016** [16] | Нове антимонопольне провадження |
| Точні рядки лейбла на бейджі, який малює `ads.js`; чи можна його вимкнути | Google публікує лише стилізацію бейджа [44] | Партнерська документація (недоступна без логіну) |
| Чи Sedo, ExplorAds, Iron Click — прямі партнери чи ре-синдикатори | **Жодна не заявляє прямого партнерства.** Iron Click зарезервував «direct» для Yahoo/Bing і Google лише перелічив [48] | Пряме питання в онбордингу + документальне підтвердження |
| Rev-share будь-якого провайдера | **Не публікує жодна компанія ринку. Нуль.** | Тільки NDA-розмова |
| Списки заборонених вертикалей і гео у провайдерів | Не публікує ніхто; Tonic прямо каже, що обмежує «certain verticals», списку не дає [47] | Питання в онбордингу |
| Ліміт 100 native style ID з 03.06.2026 | Сам факт **підтверджено первинно** на сторінці Google [42]; дата розсилки повідомлення (05.03.2026) — лише з галузевої преси [20]. **Записи в policy change log немає** — паралель до історії з травнем 2022 | — |
| Продаж Sedo материнською IONOS | Community-повідомлення, на sedo.com не підтверджено | Заява IONOS/Sedo |
| Параметр `afdToken` | **У чинній публічній документації CSA не існує** [5]. Реальний токен — `rsToken`. `google.ads.domains.Caf` — інший, недокументований продукт | Документація AFD, якщо вона десь є |
| «Landing Page Quality Guidelines» | Посилання в чинній політиці AdSense **застаріле** — веде на статтю про Quality Score. Документа під цією назвою більше немає | — |
| Xitrum, Ascend, Apollo як RSOC-провайдери | **Існування в цьому ринку підтвердити не вдалося взагалі** | — |

**Про датування.** Політики Google звірені 2026-08-28. Найсвіжіші враховані зміни: ліміт 100 style ID з 03.06.2026 [42]; AFD прибрано з SPN 10.02.2026 [37]; RAC обов'язковий з 01.11.2025 [21]; RAF з 25.08.2025 [2]; 20 імпресій з 20.08.2025 [1]; закриття self-serve з 17.05.2022 [34]. Ринкові дані — квартальна звітність за Q2 2026. Дані ЄК — **2016 рік**, найстаріший блок у документі.

**Методологічне застереження:** зміна від 17.05.2022 ніколи не потрапила в policy change log. Відсутність запису в change log **не є доказом**, що продукт відкритий.

---

## Джерела

**Primary — Google (P)**

1. [AdSense for Search (AFS)](https://support.google.com/adsense/answer/9879?hl=en) — що таке AFS, sign-up через account manager, поріг 20 імпресій з 20.08.2025. **P**
2. [AdSense for Search Restricted Access Features (RAFs)](https://support.google.com/adsense/answer/16262554?hl=en) — RAF-фічі, статуси, страйки, 180-денний lookback, $10 000/міс, «one AdSense account per business entity». **P**
3. [AdSense for Search (AFS) policies](https://support.google.com/adsense/answer/1354757?hl=en) — 2 search boxes на сторінку, 5 млрд запитів/рік, заборона pre-populated queries. **P**
4. [Search ads policies](https://support.google.com/adsense/answer/7003954?hl=en) — CSA-протокол, три джерела наміру, ліміти ad units, заборона backfill. **P**
5. [Web Implementation — AdSense Custom Search Ads for the Web](https://developers.google.com/custom-search-ads/web) — `ads.js`, `_googCsa`, `relatedSearchTargeting` (+дефолт `'query'` як порушення), `referrerAdCreative`, `ignoredPageParams`, Things to Avoid. Довідник параметрів: [reference](https://developers.google.com/custom-search-ads/web/reference). **P**
6. [Related search for your content pages](https://support.google.com/adsense/answer/10233819?hl=en) — контрактинг через акаунт-менеджера, мокап на рев'ю, FAQ про платний трафік, RAC verbatim, funnel-метрики, `rsToken`, `termPositions`, заборонені типи сторінок. **P**
7. [AdSense for Search Product-Integrated Feature policies](https://support.google.com/adsense/answer/14638581?hl=en) — три PIF, Common PIF Policies, Partner-provided terms, секція «Acquiring traffic». **P**
8. [Introducing related search for content pages (14.02.2022)](https://support.google.com/adsense/answer/11575703?hl=en) — анонс фічі. **P**
9. [Policy violations in scope for Restricted Access Features (RAFs)](https://support.google.com/adsense/answer/16269587?hl=en) — таблиця normal vs egregious; Advertiser Harm / Gross Misconfigurations / Scaled Deception / Ecosystem Degradation. **P**
10. [Google Search ads policy: Alternative Search Queries](https://support.google.com/adsense/answer/9467389?hl=en) — чотири ASQ і вимоги до кожного. **P**
17. [How to earn with AdSense for Search](https://support.google.com/adsense/answer/35873?hl=en) — **«For AFS, publishers receive 51% of the revenue recognized by Google»**. **P**
18. [Payment thresholds](https://support.google.com/adsense/answer/1709871?hl=en) — $100 / €70; верифікація $10/€10. **P**
21. [AdSense policy change log](https://support.google.com/adsense/answer/9336650?hl=en) — RAC з 01.11.2025 («Omitting to do so will be considered a policy violation»); переведення RSOC з ASQ у PIF 15.11.2024; квітень 2025 — AFS більше не підтримує мобільні застосунки. **P**
22. [AdSense eligibility requirements](https://support.google.com/adsense/answer/9724?hl=en) — 18+, володіння сайтом, доступ до HTML, оригінальний контент. **P**
23. [About the ad intents format](https://support.google.com/adsense/answer/13844047?hl=en) — self-serve увімкнення через Auto ads, AFC rev-share. Анонс: [16.04.2024](https://support.google.com/adsense/answer/14184572). **P**
24. [If you want more than one AdSense account](https://support.google.com/adsense/answer/9729?hl=en) — один акаунт на паблішера, виняток для окремої організації. **P**
25. [Understanding AdSense country restrictions](https://support.google.com/adsense/answer/6167308?hl=en) — обмеження за OFAC; України в списку немає. **P**
30. [Team up with a Google Certified Publishing Partner](https://support.google.com/adsense/answer/9923323?hl=en) — GCPP scope обмежений AdSense + Ad Manager. **P**
31. [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en) — invalid clicks, encouraging clicks, **Traffic sources**, ad placement. **P**
32. [Google Publisher Policies](https://support.google.com/adsense/answer/10502938?hl=en) — 11 категорій контенту, Dishonest declarations, Misrepresentative content. **P**
34. [Add an AdSense search engine to your site](https://support.google.com/adsense/answer/160530?hl=en) — **«This feature is only available to eligible accounts created before May 17, 2022»** і «If you don't have the Search engine option, then you're not eligible». **P**
35. [FAQs about AdSense updating its revenue share structure](https://support.google.com/adsense/answer/14129646?hl=en) — «This change does not affect AdSense for Search (AFS)». **P**
36. [AdSense revenue share](https://support.google.com/adsense/answer/180195?hl=en) — AFC 80%/68%; додаткова частка платформи-партнера **після** частки Google. **P**
37. [Google Ads — Search Partner Network updates](https://support.google.com/google-ads/answer/16286960?hl=en) — «Parked Domains (AFD) will cease to be an ad surface within the Search Partner Network effective February 10, 2026». **P**
38. [Google AdSense Online Terms of Service](https://www.google.com/adsense/localized-terms) (текст: [gstatic](https://www.gstatic.com/adsense/tc/2022-v1/google_usa/en.html)) — §про invalid activity (ii) «solicited or generated by payment of money»; заборона розподілу виручки з третіми сторонами без письмового дозволу; пункт про пріоритет ToS над політиками. **P**
39. [Distributing earnings from AdSense ads with third party partners](https://support.google.com/adsense/answer/1348725?hl=en) — три заборонені схеми і «we **rarely** give publishers permission». **P**
40. [AdSense for Search and other Search Ads products to use new serving domains](https://support.google.com/adsense/answer/14201307?hl=en) — «Products in scope are: AdSense for Search (AFS), AdSense for Shopping (AFSh), and Programmable Search Engine (ProSE)». **P**
42. [Search styles / native style limits](https://support.google.com/adsense/answer/7591102?hl=en) — ліміт 100 унікальних AFS-native стилів з 03.06.2026. **P**
43. [Ad placement policies — misleading headers](https://support.google.com/adsense/answer/1346295?hl=en) — «Publishers may only label Google ads with either "Advertisements" or "Sponsored Links"». **P**
44. [Search styles — ad badge settings](https://support.google.com/adsense/answer/9000521?hl=en) — стилізація бейджа; самі рядки лейбла не публікуються. **P**
55. [About Google Partners](https://support.google.com/google-ads/answer/9029203?hl=en) — програма для агенцій/рекламодавців, вхід через Google Ads manager account. **P**
56. [Google Partners program requirements](https://support.google.com/google-ads/answer/9702452?hl=en) — вимоги в клієнтському спенді. **P**
57. [Certifications that count toward the Partners badge](https://support.google.com/google-ads/answer/9762278?hl=en) — закритий список; «No other certifications count». **P**
58. [If you want to purchase traffic to your site](https://support.google.com/adsense/answer/1348722?hl=en) — «You're welcome to promote your site in any manner that complies with our program policies». **P**
59. [Google Ads policy — Insufficient original content](https://support.google.com/adspolicy/answer/16427718?hl=en) — єдине місце, де Google вживає слово «arbitrage», і це **рекламодавча** політика. **P**
60. [CSA reference — page-level options](https://developers.google.com/custom-search-ads/web/reference) — `pubId`, `query`, `styleId`, `adPage`, `resultsPageBaseUrl`, `adtest`, `ivt`, `hl` тощо. **P**

**Primary — регулятори і SEC (P)**

11. [System1, Inc. Form 10-Q, Q2 2026 (05.08.2026)](https://www.sec.gov/Archives/edgar/data/1805833/000180583326000050/sst-20260630.htm) — угода з Google до 30.09.2027; друга terminated for convenience 10.02.2026; AMP 59 vs 133; going concern; модель Network Partners (агент, net). **P/PP**
12. [Inuvo, Inc. Form 10-Q, Q2 2026 (11.08.2026)](https://www.sec.gov/Archives/edgar/data/829323/000165495426007480/inuvo_10q.htm) — виручка −68,7% H1; Legacy Search −80%; «changes in the Google ecosystem which have suppressed RPC»; система Ranger; штат 82→51. **P/PP**
13. [Inuvo 8-K exhibit 10.8 — Extension Amendment to GSA (30.06.2026)](https://www.sec.gov/Archives/edgar/data/829323/000165495426006459/inuvo_ex108.htm) — продовження на **один місяць**, вилучення WebSearch Service. **P/PP**
14. [Inuvo 8-K exhibit 10.1 — Amendment to GSA (31.03.2026)](https://www.sec.gov/Archives/edgar/data/829323/000165495426003232/inuvo_ex101.htm) — продовження на три місяці; додано «RAF Policy» і «Restricted Access Feature»; новий §3.2 з обов'язком моніторити downstream. **P/PP**
15. [Google Services Agreement Google Inc. ↔ Synacor, Inc. (SEC exhibit 10.13.1)](https://www.sec.gov/Archives/edgar/data/1408278/000119312512034176/d253349dex10131.htm) — шаблон GSA v2 July 2010: §3.1(g) заборона co-branding / white labeling / sub-syndication; редаговані AFS Revenue Share і Deduction Percentage; схвалення сайтів; поріг розриву за виручкою; індемніті. **P**
16. [European Commission, Case AT.40411 Google Search (AdSense), рішення 20.03.2019 (PDF)](https://ec.europa.eu/competition/antitrust/cases/dec_docs/40411/40411_1619_11.pdf) — §5.1–5.3: Direct Partners / Online Partners / Simplified Contracts; 35→129→80–90 Direct Partners у ЄЕП; 7000–8000 Online Partners; EUR 170–180 млн = 70–80% чистої AFS-виручки в ЄЕП; структура GSA + Order Form із rev-share. **P**
26. [Case T-334/19 Google and Alphabet v Commission, General Court, 18.09.2024](https://curia.europa.eu/juris/liste.jsf?num=T-334/19) — скасування рішення ЄК і штрафу €1,49 млрд; більшість фактичних висновків залишено в силі. **P** (огляд: [Clifford Chance](https://www.cliffordchance.com/briefings/2024/10/on-exclusivity-clauses-and-effects--the-eu-general-court-judgmen.html), **C**)
33. [SEC EDGAR full-text search](https://efts.sec.gov/LATEST/search-index?q=%22Google+Services+Agreement%22&startdt=2024-01-01&enddt=2026-08-28) — метод: за 2024–2026 єдині публічні компанії США з GSA у поданнях — Inuvo, IAC/People Inc., Zedge. **P**
46. [Team Internet Group PLC — RNS, Search market update](https://www.investegate.co.uk/announcement/rns/team-internet-group-plc--tig/2-8-response-search-market-update-results-notice/8761533) — «In 2024, our Search segment generated $91 million in net revenue, of which approximately $72 million was derived from our **Google AFD relationship**». **P (регуляторний реліз)**

**Partner-primary (PP)**

19. [Sedo — «the RSOC Platform by Ad Compliance Guidelines Version 2.0» (PDF, 08.2025)](https://sedo.com/fileadmin/08-2025-sedoTMP-compliance-guide-v2.pdf) — три обов'язкові збіги, «зелені» формулювання, блеклист термів, правила кнопок, sub-ID макроси, обов'язковий Ad Hub-доступ. **PP**
41. [TONIC. Terms and Conditions](https://tonic.com/terms.html) — B2B only; NET-45; мінімум $1000; блокування ≤120 днів; клоубек; заборона монетизації third-party traffic; «Publisher Networks» за попереднім схваленням. **PP**
45. [Team Internet Group — Investors](https://teaminternet.com/investors/) — Tonic описано як «**Leading Google AFD & RSOC media buying platform**». **PP**
47. [TONIC. FAQ — Monetize](https://tonic.com/content/faq-monetize.html) — 4-значний денний спенд; Taboola/Outbrain/MGID/RevContent; обов'язковий проміжний контент-лендінг з подвійним схваленням; CR 25–60%, стоп нижче 10%; 24h SLA; гео і вертикалі. **PP**
48. [Iron Click — RSOC feeds](https://ironclick.network/rsoc-feeds-by-iron-click) — «Typically, 50,000+ clicks per month are recommended»; «RSOC from Google», «direct» лише для Yahoo/Bing. **PP**
49. [SedoTMP](https://sedotmp.com) + [RSoC Program Application Form](https://docs.google.com/forms/d/e/1FAIpQLSd0FGZ11LdX0Ngi0KR8gCxXKDEXsoyYTdW4G1lVC_FIjhPI5w/viewform) — RSOC-продукт; поля заявки (юрособа, бенди виручки, список конкурентів у випадайці). **PP**
61. [System1 — Partner](https://system1.com/partner) та [CASE](https://system1.com/blog/case) — «longstanding partnerships with **Google**, Bing and Yahoo»; «20+ years of Google partnership»; **CASE — white-label search feed**, заявки на CASE@system1.com. **PP**
62. [System1 docs — Parameters](https://docs.system1.com/parameters/) — «Compliance parameters such as `compkey` and `ref` are **required for Google monetization**». **PP**
63. [Above.com — Terms](https://www.above.com/terms.html) та [блог, 11.02.2026](https://www.above.com/blog/the-new-era-of-monetization-with-above) — «Paid traffic of any kind/arbitrage» заборонено; RSOC-рішення для доменів; ліміт 500 tracking ID з апгрейдом до 100 000. **PP**

**Community / secondary (C) — лише як ліди; числа непідтверджені**

20. [ppc.land — Google caps AFS native style IDs at 100 (05.03.2026)](https://ppc.land/google-caps-afs-native-style-ids-at-100-per-publisher-account-in-june/) — цитує email Google від 05.03.2026 про ліміт стилів; сам факт **підтверджено первинно** в [42], ця стаття дає лише дату розсилки. **C**
27. [Coinis glossary — RSOC](https://coinis.com/glossary/rsoc-related-search-on-content) — «≈8% approval rate», «$20 000 working capital». **C, першоджерела немає**
28. [TheOptimizer — 3-Strike RAF Rule](https://theoptimizer.io/blog/googles-3-strike-raf-rule-explained-how-to-protect-your-adsense-rsoc-access-in-2025), [ClickFlare — RSOC Policy Update 2025](https://clickflare.com/blog/rsoc-policy-update-2025-google-strike-system) — «2-річне rolling window»; **суперечить [2]**. **C, помилково**
29. [piratecpa.net — Search Feed арбітраж (09.2025)](https://piratecpa.net/2025/09/search-feed-arbitrazh-kak-lit-na-poiskovuyu-vydachu/) — «Google ~20%, байер 80%»; **суперечить опублікованим 51%** [17]. **C**
50. [traffhub.media — Пошуковий арбітраж (08.10.2024)](https://traffhub.media/articles/arbitrazh/poiskovyj-search-arbitrazh-kak-poluchat-dollary-za-kliki-kotorye-vam-ne-prinadlezhat/) — «бюджет від $150К». **C, непідтверджено**
51. [trafficcardinal.com — Лайфхаки search-арбітражу (12.08.2024)](https://trafficcardinal.com/post/lajfkhaki-dlya-search-arbitrazha-podklyuchenie-k-provajderu-i-poisk-kreo-za-2-minuty) — «зарубіжна компанія + фінзвітність за півроку». **C, непідтверджено**
52. [cpa.rip — Search arbitrage (16.04.2024)](https://cpa.rip/search-arbitrage/search-arbitrage/) — «$30 000 на тест кейвордів», «онбординг ~тиждень», NET 30/45. **C, непідтверджено**
53. [undetectable.io — Поисковый арбитраж (24.07.2026)](https://undetectable.io/ru/blog/search-arbitrage/) — «Tonic від ~$3000/день» (суперечить [47]); CR 25–60% (**збігається** з [47]); «зазвичай 80/20». **C, частково підтверджено**
54. [ban.media — Що таке search arbitrage (11.04.2024)](https://ban.media/story/shcho-take-search-arbitrage) — коментар: «беруть тільки компанії з оборотами мінімум 3к в день». **C, це коментар**
- [ppc.land — Google announces Restricted Access Features](https://ppc.land/google-announces-restricted-access-features-for-adsense-search/) — датування анонсу RAF (24.06.2025, старт 25.08.2025). **C**
- [domainnamewire — 2025 in review: the death of AdSense for Domains](https://domainnamewire.com/2025/12/31/2025-in-review-the-death-of-adsense-for-domains/) та [domaininvesting — Bodis to cease operating](https://domaininvesting.com/bodis-to-cease-operating-on-january-31/) — смерть AFD і закриття Bodis 31.01.2026. **C**
