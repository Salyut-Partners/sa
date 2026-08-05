#!/bin/bash
# Встановлення пайплайну автосубтитрів. Запускати з теки проєкту:
#   ./setup.sh
# Скрипт можна ганяти повторно — він пропускає те, що вже стоїть.

set -u
cd "$(dirname "$0")" || exit 1

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[34m→\033[0m %s\n" "$1"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

echo
echo "Автосубтитри — встановлення"
echo "==========================="

# 1. Залізо
[ "$(uname -s)" = "Darwin" ] || die "Потрібен macOS."
[ "$(uname -m)" = "arm64" ] || die "Потрібен Mac на Apple Silicon (M1+). mlx на Intel не працює."
ok "macOS на Apple Silicon"

# 2. Homebrew
command -v brew >/dev/null 2>&1 || die "Немає Homebrew. Постав його й запусти цей скрипт знову:
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
BREW="$(brew --prefix)"
ok "Homebrew: $BREW"

brew_need() {
  # $2 — "--cask" для касків. Каски перевіряються іншою командою, ніж формули:
  # `brew list --versions` їх не бачить і переставляє щоразу.
  if brew list $2 --versions "$1" >/dev/null 2>&1; then
    ok "$1 вже стоїть"
  else
    info "ставлю $1…"
    brew install $2 "$1" || die "не вдалося поставити $1"
    ok "$1"
  fi
}

# 3. Python. Системний від Apple не вміє створювати venv.
brew_need python@3.11 ""
PY="$BREW/opt/python@3.11/bin/python3.11"
[ -x "$PY" ] || die "не знайшов $PY"

# 4. Обидва ffmpeg — це не помилка.
#    Звичайний зібраний без libass і не вміє вшивати субтитри,
#    але саме його викликає mlx-whisper для читання аудіо.
#    ffmpeg-full уміє вшивати, але keg-only й не потрапляє в PATH.
brew_need ffmpeg ""
brew_need ffmpeg-full ""

FFULL="$BREW/opt/ffmpeg-full/bin/ffmpeg"
[ -x "$FFULL" ] || die "не знайшов $FFULL"
if "$FFULL" -hide_banner -filters 2>/dev/null | grep -qE '^ .. ass '; then
  ok "ffmpeg-full уміє вшивати субтитри (фільтр ass)"
else
  die "у ffmpeg-full немає фільтра ass — вшити субтитри не вийде"
fi

# 5. Шрифт
brew_need font-montserrat "--cask"

# 6. Оточення
if [ -x technical/.venv/bin/python ]; then
  ok "venv уже є"
else
  info "створюю venv…"
  "$PY" -m venv technical/.venv || die "не вдалося створити venv"
  ok "venv"
fi
info "перевіряю бібліотеки…"
technical/.venv/bin/pip install --quiet --upgrade pip >/dev/null 2>&1
technical/.venv/bin/pip install --quiet mlx-whisper fonttools || die "не вдалося поставити бібліотеки"
ok "mlx-whisper і fonttools"

# 7. Жирний шрифт із варіативного
if [ -f technical/fonts/MontserratSubs.ttf ]; then
  ok "шрифт для субтитрів на місці"
else
  info "збираю статичний ExtraBold…"
  (cd technical && ./.venv/bin/python make_font.py) || die "не вдалося зібрати шрифт"
fi

# 8. Робочі теки
mkdir -p inbox output processed
technical/.venv/bin/python - <<'EOF'
import sys
sys.path.insert(0, "technical")
import subtitle_styler, pathlib
for style in subtitle_styler.STYLES:
    pathlib.Path("inbox", style).mkdir(parents=True, exist_ok=True)
print(f"  \033[32m✓\033[0m теки inbox: {', '.join(subtitle_styler.STYLES)}")
EOF

# 9. Підсумкова перевірка
technical/.venv/bin/python - <<'EOF' || exit 1
import sys
sys.path.insert(0, "technical")
try:
    import mlx_whisper  # noqa: F401
    import subtitle_styler as ss
    ss.find_ffmpeg()
    ss.FontMetrics.load(ss.FONTS_DIR / "MontserratSubs.ttf")
except Exception as exc:
    print(f"\n\033[31m✗ перевірка не пройшла: {exc}\033[0m")
    sys.exit(1)
print("  \033[32m✓\033[0m усе на місці")
EOF

cat <<'EOF'

Готово. Запуск:

    ./run.sh

Далі кидай відео в теку inbox/<стиль>/ — назва теки визначає вигляд субтитрів,
у кожній лежить _приклад.png. Готове забирай з output/.

Перший ролик оброблятиметься довше: качається модель розпізнавання (~1.5 ГБ).
EOF
