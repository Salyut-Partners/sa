#!/usr/bin/env bash
# Валідатор бази — інваріанти з DESIGN.md плюс перевірка front-matter.
# Локально: bash scripts/validate.sh
# У CI його ганяє .github/workflows/validate.yml на кожному PR.
set -u
cd "$(dirname "$0")/.."
fail=0
err() { echo "✗ $*"; fail=1; }

# 1. Імена файлів унікальні по всій базі (.claude/ — службова тека скілів, не нотатки)
dups=$(find . -name "*.md" -not -path "./.git/*" -not -path "./.claude/*" -exec basename {} \; | sort | uniq -d)
[ -n "$dups" ] && err "дублі імен: $dups"

# 2. Немає битих wikilink'ів
# (DESIGN.md і CLAUDE.md виключено — там синтаксис [[...]] згадується як текст; .claude/ — не нотатки)
for l in $(grep -rho '\[\[[^]|]*' --include="*.md" --exclude=DESIGN.md --exclude=CLAUDE.md --exclude-dir=.claude . | sed 's/\[\[//' | sort -u); do
  find . -name "$l.md" -not -path "./.git/*" -not -path "./.claude/*" | grep -q . || err "битий wikilink: $l"
done

# 3. Знання й правила: чотири обов'язкові поля
for f in $(find compliance knowledge -name "*.md"); do
  for k in status source date last_confirmed; do
    grep -q "^$k:" "$f" || err "$f — нема поля $k"
  done
done

# 4. Кожна нотатка знання досяжна з карти
for f in knowledge/*.md; do
  n=$(basename "$f" .md); [ "$n" = "knowledge-map" ] && continue
  grep -q "\[\[$n\]\]" knowledge/knowledge-map.md || err "не в карті: $n"
done

# 5. Фасети зв'язок не протекли в знання і правила
leak=$(grep -ln "^vertical:\|^geo:\|^language:\|^traffic_source:\|^outcome:" knowledge/*.md compliance/*.md compliance/*/*.md 2>/dev/null)
[ -n "$leak" ] && err "фасети зв'язок у знаннях/правилах: $leak"

# 6. Поля stale не існує
st=$(grep -rln "^stale:" --include="*.md" . 2>/dev/null)
[ -n "$st" ] && err "заборонене поле stale: $st"

# 7. Зв'язки: вісім полів, закриті словники, без status
for f in $(find bundles -name "*.md" 2>/dev/null); do
  for k in vertical geo language traffic_source outcome source date last_confirmed; do
    grep -q "^$k:" "$f" || err "$f — нема поля $k"
  done
  grep -q "^status:" "$f" && err "$f — поле status не для зв'язок"
  v=$(sed -n 's/^vertical: *//p' "$f" | head -1)
  case "$v" in кредити|фінанси|оренда|jobs|dental|сезонка|"") ;; *) err "$f — vertical поза словником: $v";; esac
  t=$(sed -n 's/^traffic_source: *//p' "$f" | head -1)
  case "$t" in TikTok|Facebook|нативка|"") ;; *) err "$f — traffic_source поза словником: $t";; esac
  o=$(sed -n 's/^outcome: *//p' "$f" | head -1)
  case "$o" in зайшла|злила|"") ;; *) err "$f — outcome поза словником: $o";; esac
  g=$(sed -n 's/^geo: *//p' "$f" | head -1)
  [ -n "$g" ] && { echo "$g" | grep -Eq '^[A-Z]{2}$' || err "$f — geo не код країни: $g"; }
done

# 8. Словник status у знаннях і правилах
for f in $(find compliance knowledge -name "*.md"); do
  s=$(sed -n 's/^status: *//p' "$f" | head -1)
  case "$s" in перевірено-практикою|зі-слів-партнера|гіпотеза|застаріле|"") ;; *) err "$f — status поза словником: $s";; esac
done

# 9. Дати у форматі YYYY-MM-DD
for f in $(find knowledge compliance bundles -name "*.md" 2>/dev/null); do
  for k in date last_confirmed; do
    d=$(sed -n "s/^$k: *//p" "$f" | head -1)
    [ -n "$d" ] && { echo "$d" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || err "$f — $k не YYYY-MM-DD: $d"; }
  done
done

if [ $fail -eq 0 ]; then
  echo "✓ база чиста — всі перевірки мовчать"
fi
exit $fail
