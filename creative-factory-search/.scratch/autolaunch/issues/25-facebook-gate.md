# 25 — Facebook через гейт

**What to build:** ланцюг заливу для кабінету з `source: facebook`: довідники (`/facebook/ad-accounts`, `/pixels?traffic_source=facebook`, теми), креативи з `traffic_sources: [facebook]`, TSP і Campaign Builder з полями, яких вимагає Facebook (зняти з дампів адмінки — форми можуть відрізнятись від TikTok), автоправила без змін. `plan` для Facebook-кампанії показує ті самі кроки з правильними тілами; `apply` проходить на живому акаунті одного топіка Артема.

**Blocked by:** 22 — Таблиця топіка.

**Status:** ready-for-agent

- [ ] Дампи Facebook-форм TSP і builder лежать у `search arbitrage resources/api-requests-roots` з вичищеним Bearer
- [ ] `sa plan` для кампанії на Facebook-кабінеті показує повні тіла без полів TikTok і без порожніх обов'язкових полів
- [ ] Один живий `apply` на Facebook пройшов і записав id у `state.json`; перевіряє Артем
- [ ] Відмінності Facebook від TikTok у тілах покриті тестами `core`
