# 25 — Facebook через гейт

**What to build:** ланцюг заливу для кабінету з `source: facebook`: довідники (`/facebook/ad-accounts`, `/pixels?traffic_source=facebook`, теми), креативи з `traffic_sources: [facebook]`, TSP і Campaign Builder з полями, яких вимагає Facebook (зняти з дампів адмінки — форми можуть відрізнятись від TikTok), автоправила без змін. `plan` для Facebook-кампанії показує ті самі кроки з правильними тілами; `apply` проходить на живому акаунті одного топіка Артема.

**Blocked by:** 22 — Таблиця топіка.

**Status:** blocked-on-dumps (2026-09-11) — що можна без дампів, зроблено ще в тікеті 18 і зараз: довідники читаються по джерелу (`/pixels?traffic_source=facebook`, `/facebook/ad-accounts?site_id=&traffic_source=facebook`), креативи/headline/TSP/builder несуть `facebook` (тест `core`), таблиця групує Facebook-кабінети окремо; додано попередження в плані для кампанії на Facebook-кабінеті: форми TSP і builder не звірені з дампами, тіла складені за TikTok (`FACEBOOK_UNVERIFIED` у `core/campaign-plan.ts`, тест). У `search arbitrage resources/api-requests-roots` Facebook-форм немає: там лише TikTok-дампи TSP/builder і `GET /facebook/accounts` (BM-кабінети з `account_id: act_…`, `timezone`, `sites[]`). **Потрібно від Артема:** дампи `POST /traffic-source-profiles` і `POST /campaign-builder` для Facebook, зняті з адмінки (з вичищеним Bearer) — після них: різниці тіл у `core` з тестами, `sa plan` без TikTok-полів, один живий `apply`.

- [ ] Дампи Facebook-форм TSP і builder лежать у `search arbitrage resources/api-requests-roots` з вичищеним Bearer
- [ ] `sa plan` для кампанії на Facebook-кабінеті показує повні тіла без полів TikTok і без порожніх обов'язкових полів
- [ ] Один живий `apply` на Facebook пройшов і записав id у `state.json`; перевіряє Артем
- [ ] Відмінності Facebook від TikTok у тілах покриті тестами `core`
