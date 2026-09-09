#!/usr/bin/env python3
"""Транскрибує відео через mlx-whisper і вшиває стилізовані субтитри."""

# Анотації лишаються текстом: `--list-styles` має працювати й із системним
# Python 3.9, до того як setup.sh поставив venv.
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MODEL = "mlx-community/whisper-large-v3-turbo"

# Статичний жирний шрифт, згенерований make_font.py
FONTS_DIR = Path(__file__).resolve().parent / "fonts"
DEFAULT_FONT = "Montserrat Subs"

# Homebrew-івський ffmpeg зібраний без libass — фільтра `ass` там немає.
# Тому шукаємо збірку, яка вміє вшивати субтитри (ffmpeg-full).
FFMPEG_CANDIDATES = [
    os.environ.get("FFMPEG"),
    "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
    "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
    shutil.which("ffmpeg"),
]


def _has_ass_filter(binary: str) -> bool:
    try:
        out = subprocess.run([binary, "-hide_banner", "-filters"],
                             capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return any(line.split()[1:2] == ["ass"] for line in out.splitlines() if line.strip())


def find_ffmpeg() -> str:
    for candidate in FFMPEG_CANDIDATES:
        if candidate and Path(candidate).exists() and _has_ass_filter(candidate):
            return candidate
    raise RuntimeError(
        "не знайдено ffmpeg із підтримкою libass (фільтр `ass`).\n"
        "Постав його: brew install ffmpeg-full"
    )


def find_ffprobe() -> str:
    ffprobe = Path(find_ffmpeg()).with_name("ffprobe")
    return str(ffprobe) if ffprobe.exists() else "ffprobe"

# Кольори в ASS — &HAABBGGRR (не RGB!). AA=00 непрозорий, FF — повністю прозорий.
#
# pos — де стоять субтитри: частка висоти кадру від низу.
# 0.24 — нижня третина кадру, але ще вище підпису, кнопок і нижньої навігації
# TikTok. Менше 0.18 вже ризиковано: інтерфейс почне перекривати текст.
TIKTOK_POS = 0.24

STYLES = {
    # 1. Базовий — 4 слова на екран, активне слово жовтим
    "yellow": {
        "base": "&H00FFFFFF",
        "accent": "&H0000E5FF",
        "outline": "&H00000000",
        "words_per_chunk": 4,
        "size_ratio": 0.048,
        "highlight": True,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
    # 2. Hormozi-стиль — крупніше, 3 слова, активне слово салатовим
    "green": {
        "base": "&H00FFFFFF",
        "accent": "&H0037E92E",
        "outline": "&H00000000",
        "words_per_chunk": 3,
        "size_ratio": 0.058,
        "highlight": True,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
    # 3. Те саме, але активне слово червоним
    "red": {
        "base": "&H00FFFFFF",
        "accent": "&H003C3CFF",
        "outline": "&H00000000",
        "words_per_chunk": 3,
        "size_ratio": 0.058,
        "highlight": True,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
    # 4. Білий текст із чорною обводкою, активне слово на чорній заокругленій плашці
    "box": {
        "base": "&H00FFFFFF",
        "accent": "&H00FFFFFF",
        "outline": "&H00000000",
        "fill": "&H00000000",           # заливка під активним словом
        "radius_ratio": 0.30,           # заокруглення кутів, частка кегля
        "pad_x": 0.16,
        "pad_y": 0.14,
        "outline_ratio": 0.045,
        "shadow_ratio": 0.015,
        "shadow_colour": "&HC0000000",
        "words_per_chunk": 3,
        "size_ratio": 0.052,
        "highlight": True,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
    # 5. По одному слову, крупно
    "one-word": {
        "base": "&H00FFFFFF",
        "accent": "&H0000E5FF",
        "outline": "&H00000000",
        "words_per_chunk": 1,
        "size_ratio": 0.075,
        "highlight": True,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
    # Без підсвітки — статичні рядки
    "simple": {
        "base": "&H00FFFFFF",
        "accent": "&H00FFFFFF",
        "outline": "&H00000000",
        "words_per_chunk": 7,
        "size_ratio": 0.042,
        "highlight": False,
        "uppercase": True,
        "pos": TIKTOK_POS,
    },
}

DEFAULT_STYLE = "yellow"


def probe_size(video: Path) -> tuple[int, int]:
    out = subprocess.run(
        [find_ffprobe(), "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(video)],
        capture_output=True, text=True, check=True,
    ).stdout
    stream = json.loads(out)["streams"][0]
    return int(stream["width"]), int(stream["height"])


def transcribe(video: Path, lang: str | None) -> list[dict]:
    import mlx_whisper

    result = mlx_whisper.transcribe(
        str(video),
        path_or_hf_repo=MODEL,
        language=lang,
        word_timestamps=True,
        verbose=False,
    )
    if lang is None:
        print(f"  → визначена мова: {result.get('language', '?')}", flush=True)
    return result.get("segments", [])


def collect_words(segments: list[dict]) -> list[dict]:
    """Плаский список слів з таймкодами. Сегменти без word-таймкодів — цілим блоком.

    Whisper розбиває складені слова на окремі токени й ставить пробіл перед
    кожним: " rent", " -to", " -own" -> на екрані «rent -to -own». Тому пробіл
    вирішуємо не за сирим токеном, а за пунктуацією на стику.
    """
    words = []
    for seg in segments:
        seg_words = seg.get("words") or []
        if seg_words:
            for w in seg_words:
                text = w["word"].strip()
                if text:
                    words.append({"text": text, "start": w["start"], "end": w["end"]})
        else:
            text = seg.get("text", "").strip()
            if text:
                words.append({"text": text, "start": seg["start"], "end": seg["end"]})

    for index, word in enumerate(words):
        word["space"] = index > 0 and needs_space(words[index - 1]["text"], word["text"])
    return words


# Перед цим пробіл не ставимо (дефіси, пунктуація, апострофи)
NO_SPACE_BEFORE = ("-", "\u2014", ",", ".", "!", "?", ":", ";", "\u2026", ")", "]", "'", "\u2019", "%")
# Після цього — теж не ставимо
NO_SPACE_AFTER = ("-", "\u2014", "(", "[", "'", "\u2019")


def needs_space(previous: str, current: str) -> bool:
    return not (current.startswith(NO_SPACE_BEFORE) or previous.endswith(NO_SPACE_AFTER))


def join_words(parts: list[tuple[dict, str]]) -> str:
    """Склеює слова, поважаючи прапорець пробілу (перше слово — завжди без нього)."""
    out = []
    for index, (word, rendered) in enumerate(parts):
        if index and word.get("space", True):
            out.append(" ")
        out.append(rendered)
    return "".join(out)


def chunk_words(words: list[dict], per_chunk: int, max_gap: float = 0.7) -> list[list[dict]]:
    """Групує слова в екрани: по кількості, по паузі та по кінцю речення."""
    chunks, current = [], []
    for w in words:
        if current:
            gap = w["start"] - current[-1]["end"]
            ends_sentence = current[-1]["text"][-1] in ".!?…"
            # не розриваємо склейку типу rent-to-own — токен без пробілу лишається з попереднім
            splittable = w.get("space", True)
            if splittable and (len(current) >= per_chunk or gap > max_gap or ends_sentence):
                chunks.append(current)
                current = []
        current.append(w)
    if current:
        chunks.append(current)
    return chunks


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int(seconds % 3600 // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def inline_colour(colour: str) -> str:
    """У стилі колір задається як &HAABBGGRR, а в тегах \\c/\\3c — як &HBBGGRR&."""
    digits = colour.lstrip("&Hh").rstrip("&")
    return f"&H{digits[-6:]}&"


PROJECT_DIR = Path(__file__).resolve().parent.parent

SETUP_HINT = ("Схоже, оточення застаріло після оновлення коду.\n"
              "Перезапусти встановлення — воно доставить, чого бракує:\n"
              f"  cd {PROJECT_DIR} && ./setup.sh")


def load_ttfont():
    """fontTools зʼявився в залежностях пізніше за перші установки. Якщо його
    немає, треба сказати що робити, а не валитися стектрейсом посеред файлу."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError as exc:
        raise RuntimeError(f"не встановлено fontTools.\n{SETUP_HINT}") from exc
    return TTFont


def missing_dependencies() -> list[str]:
    """Чого бракує в оточенні. Перевіряється на старті, а не посеред обробки."""
    missing = []
    for module, package in (("mlx_whisper", "mlx-whisper"), ("fontTools", "fonttools")):
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    return missing


_FONT_INDEX: "dict[str, Path] | None" = None


def font_index() -> dict[str, Path]:
    """Назва сімʼї шрифту -> файл у fonts/.

    Стиль задає шрифт назвою (її ж бачить libass), а нам для обміру тексту
    потрібен сам файл. Тому один раз читаємо name-таблиці всіх шрифтів у теці.
    """
    global _FONT_INDEX
    if _FONT_INDEX is not None:
        return _FONT_INDEX

    TTFont = load_ttfont()

    index: dict[str, Path] = {}
    for path in sorted(FONTS_DIR.glob("*")):
        if path.suffix.lower() not in (".ttf", ".otf"):
            continue
        try:
            font = TTFont(str(path), lazy=True)
            for record in font["name"].names:
                if record.nameID in (1, 16):  # сімʼя і типографічна сімʼя
                    index.setdefault(str(record).strip().lower(), path)
        except Exception:
            continue  # биті чи екзотичні файли просто пропускаємо
    _FONT_INDEX = index
    return index


def font_file(family: str) -> "Path | None":
    return font_index().get(family.strip().lower())


class FontMetrics:
    """Міряє ширину тексту за таблицями шрифту — потрібно, щоб самим малювати
    плашку із заокругленими кутами (libass уміє тільки прямокутну)."""

    _cache: dict[str, "FontMetrics"] = {}

    def __init__(self, path: Path):
        TTFont = load_ttfont()

        font = TTFont(str(path), lazy=True)
        self.upem = font["head"].unitsPerEm
        self.cmap = font.getBestCmap()
        self.hmtx = font["hmtx"]
        os2 = font["OS/2"]
        self.cap = getattr(os2, "sCapHeight", None) or round(self.upem * 0.7)
        self.win_ascent = os2.usWinAscent
        self.win_descent = os2.usWinDescent
        # libass бере за Fontsize не розмір em, а висоту рядка (usWin*),
        # тож реальний em виходить меншим. Для цього шрифту — 0.64 від кегля.
        self.scale = self.upem / (self.win_ascent + self.win_descent)

    @classmethod
    def load(cls, path: Path) -> "FontMetrics | None":
        key = str(path)
        if key not in cls._cache:
            if not path.exists():
                return None
            cls._cache[key] = cls(path)
        return cls._cache[key]

    def _px(self, units: float, size: float) -> float:
        return units * size * self.scale / self.upem

    def width(self, text: str, size: float) -> float:
        total = 0
        for ch in text:
            glyph = self.cmap.get(ord(ch))
            if glyph is None:
                glyph = ".notdef"
            total += self.hmtx[glyph][0]
        return self._px(total, size)

    def cap_height(self, size: float) -> float:
        return self._px(self.cap, size)

    def cap_offset(self, size: float) -> float:
        """Наскільки центр великих літер вище за центр рядка (для \\an5)."""
        line_centre = (self.win_ascent - self.win_descent) / 2
        return self._px(line_centre - self.cap / 2, size)


def rounded_rect(w: float, h: float, r: float) -> str:
    """Шлях ASS-примітива: прямокутник w×h з кутом у (0,0) і радіусом r.

    Координати саме від нуля, а не від центру: libass прикладає примітив так,
    що центр його bbox лягає в \\pos. Тобто рисунок 0..w/0..h з \\an5 стає
    рівно по центру заданої точки, а симетричний -w/2..w/2 — зʼїжджає на пів-ширини.
    """
    r = max(0.0, min(r, w / 2, h / 2))
    x0, y0, x1, y1 = 0.0, 0.0, w, h
    p = [f"m {x0 + r:.0f} {y0:.0f}"]
    p.append(f"l {x1 - r:.0f} {y0:.0f}")
    p.append(f"b {x1:.0f} {y0:.0f} {x1:.0f} {y0:.0f} {x1:.0f} {y0 + r:.0f}")
    p.append(f"l {x1:.0f} {y1 - r:.0f}")
    p.append(f"b {x1:.0f} {y1:.0f} {x1:.0f} {y1:.0f} {x1 - r:.0f} {y1:.0f}")
    p.append(f"l {x0 + r:.0f} {y1:.0f}")
    p.append(f"b {x0:.0f} {y1:.0f} {x0:.0f} {y1:.0f} {x0:.0f} {y1 - r:.0f}")
    p.append(f"l {x0:.0f} {y0 + r:.0f}")
    p.append(f"b {x0:.0f} {y0:.0f} {x0:.0f} {y0:.0f} {x0 + r:.0f} {y0:.0f}")
    return " ".join(p)


def build_ass(chunks: list[list[dict]], width: int, height: int, style: dict, font: str) -> str:
    size = round(height * style["size_ratio"])
    margin_v = round(height * style.get("pos", TIKTOK_POS))
    margin_h = round(width * 0.08)
    outline = max(2, round(size * style.get("outline_ratio", 0.10)))
    shadow = max(0, round(size * style.get("shadow_ratio", 0.04)))
    back = style.get("shadow_colour", "&H80000000")
    fill = style.get("fill")
    radius = size * style["radius_ratio"] if "radius_ratio" in style else None
    metrics = None
    if radius:
        # Міряти треба саме той шрифт, яким стиль малюється, інакше плашка зʼїде.
        path = font_file(font)
        if path is None:
            raise RuntimeError(
                f"стиль просить заокруглену плашку шрифтом «{font}», але файлу з такою\n"
                f"назвою сімʼї немає в {FONTS_DIR}.\n"
                f"Знайдені шрифти: {', '.join(sorted(font_index())) or '(жодного)'}"
            )
        metrics = FontMetrics.load(path)

    common = f"{font},{size}"
    tail = f"2,{margin_h},{margin_h},{margin_v},1"
    styles = [
        f'Style: Main,{common},{style["base"]},{style["accent"]},{style["outline"]},'
        f"{back},1,0,0,0,100,100,0,0,1,{outline},{shadow},{tail}"
    ]
    if fill:
        # BorderStyle=3 малює заливку замість обводки, а нам треба і те, і те.
        # Тому заливка йде окремим стилем на нижньому шарі, текст із обводкою —
        # поверх неї. Метрики однакові, тож рядки збігаються піксель у піксель.
        pad = max(4, round(size * 0.16))
        styles.append(
            f"Style: Fill,{common},&H00FFFFFF,&H00FFFFFF,{fill},"
            f"&H00000000,1,0,0,0,100,100,0,0,3,{pad},0,{tail}"
        )

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
""" + "\n".join(styles) + """

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    pad_x = size * style.get("pad_x", 0.16)
    pad_y = size * style.get("pad_y", 0.14)

    def render(word: dict) -> str:
        text = word["text"]
        return escape(text.upper() if style.get("uppercase") else text)

    def colour_tag(is_active: bool) -> str:
        return f"{{\\c{inline_colour(style['accent'] if is_active else style['base'])}}}"

    # Текст на шарі заливки завжди прозорий (\1a) — його малює верхній шар.
    # Видима лише рамка (\3a) під активним словом.
    FILL_ON = "{\\1a&HFF&\\3a&H00&}"
    FILL_OFF = "{\\1a&HFF&\\3a&HFF&}"

    def fill_line(chunk: list[dict], active: int) -> str:
        """Пробіли віддаємо невидимому прогону, інакше плашка вилазить за слово."""
        out = []
        for j, w in enumerate(chunk):
            if j and w.get("space", True):
                out.append(FILL_OFF + " ")
            out.append((FILL_ON if j == active else FILL_OFF) + render(w))
        return "".join(out)

    def event(layer: int, start: float, stop: float, name: str, text: str) -> str:
        return f"Dialogue: {layer},{ass_time(start)},{ass_time(stop)},{name},,0,0,0,,{text}"

    def drawn_chunk(chunk: list[dict]) -> list[str]:
        """Малюємо плашку самі: міряємо слова, центруємо рядок, ставимо кожне
        слово через \\pos. libass уміє лише прямі кути, а тут потрібні заокруглені."""
        gap = metrics.width(" ", size)
        widths = [metrics.width(render(w), size) for w in chunk]
        total = sum(widths) + gap * (len(chunk) - 1)

        cx0 = width / 2 - total / 2
        cy = height - margin_v                      # центр рядка тексту
        cy_box = cy + metrics.cap_offset(size)      # центр великих літер
        box_h = metrics.cap_height(size) + 2 * pad_y

        out, x = [], cx0
        centres = []
        for w in widths:
            centres.append(x + w / 2)
            x += w + gap

        for i, active in enumerate(chunk):
            stop = chunk[i + 1]["start"] if i + 1 < len(chunk) else active["end"]
            stop = max(stop, active["start"] + 0.08)
            box_w = widths[i] + 2 * pad_x
            path = rounded_rect(box_w, box_h, radius)
            out.append(event(
                0, active["start"], stop, "Main",
                f"{{\\an5\\pos({centres[i]:.0f},{cy_box:.0f})\\bord0\\shad0"
                f"\\1c{inline_colour(fill)}\\p1}}{path}{{\\p0}}"
            ))

        text_start, text_stop = chunk[0]["start"], chunk[-1]["end"]
        for i, w in enumerate(chunk):
            out.append(event(
                1, text_start, text_stop, "Main",
                f"{{\\an5\\pos({centres[i]:.0f},{cy:.0f})}}{render(w)}"
            ))
        return out

    lines = []
    for chunk in chunks:
        if not style["highlight"]:
            text = join_words([(w, render(w)) for w in chunk])
            lines.append(event(0, chunk[0]["start"], chunk[-1]["end"], "Main", text))
            continue

        if fill and metrics:
            lines.extend(drawn_chunk(chunk))
        elif fill:
            # Заливка стрибає по словах, а сам рядок висить цілим на весь чанк.
            for i, active in enumerate(chunk):
                stop = chunk[i + 1]["start"] if i + 1 < len(chunk) else active["end"]
                stop = max(stop, active["start"] + 0.08)
                lines.append(event(0, active["start"], stop, "Fill", fill_line(chunk, i)))
            text = join_words([(w, colour_tag(False) + render(w)) for w in chunk])
            lines.append(event(1, chunk[0]["start"], chunk[-1]["end"], "Main", text))
        else:
            for i, active in enumerate(chunk):
                stop = chunk[i + 1]["start"] if i + 1 < len(chunk) else active["end"]
                stop = max(stop, active["start"] + 0.08)
                parts = [(w, colour_tag(i == j) + render(w)) for j, w in enumerate(chunk)]
                lines.append(event(0, active["start"], stop, "Main", join_words(parts)))

    return header + "\n".join(lines) + "\n"


def burn(video: Path, ass_path: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    # Парсер фільтрів ffmpeg ріже ці символи у шляху — екрануємо
    def escape_filter(value: str) -> str:
        for ch in ("\\", ":", "'", ",", "[", "]", ";"):
            value = value.replace(ch, "\\" + ch)
        return value

    ass_filter = f"ass={escape_filter(str(ass_path))}"
    if FONTS_DIR.is_dir():
        ass_filter += f":fontsdir={escape_filter(str(FONTS_DIR))}"

    subprocess.run(
        [find_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", "-stats",
         "-i", str(video),
         # у файлах із обкладинкою є другий відеопотік (mjpeg) — беремо саме перший
         "-map", "0:v:0", "-map", "0:a?",
         "-vf", ass_filter,
         "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p",
         "-c:a", "copy",
         str(output)],
        check=True,
    )


def process(video: Path, output: Path, lang: str | None, style_name: str,
            font: "str | None" = None,
            keep_ass: bool = False) -> Path:
    """font=None означає «взяти зі стилю»; явно переданий перекриває стиль."""
    style = STYLES[style_name]
    font = font or style.get("font") or DEFAULT_FONT

    if font != DEFAULT_FONT:
        print(f"  → шрифт: {font}", flush=True)
    print(f"  → транскрибую ({lang or 'автовизначення мови'})…", flush=True)
    segments = transcribe(video, lang)
    words = collect_words(segments)
    if not words:
        raise RuntimeError("не розпізнано жодного слова — тиша або немає аудіодоріжки")
    print(f"  → {len(words)} слів", flush=True)

    width, height = probe_size(video)
    chunks = chunk_words(words, style["words_per_chunk"])
    ass_text = build_ass(chunks, width, height, style, font)

    if keep_ass:
        ass_path = output.with_suffix(".ass")
        ass_path.parent.mkdir(parents=True, exist_ok=True)
        ass_path.write_text(ass_text, encoding="utf-8")
    else:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".ass", delete=False, encoding="utf-8")
        tmp.write(ass_text)
        tmp.close()
        ass_path = Path(tmp.name)

    print("  → вшиваю субтитри…", flush=True)
    try:
        burn(video, ass_path, output)
    finally:
        if not keep_ass:
            ass_path.unlink(missing_ok=True)

    return output


def style_catalogue() -> dict:
    """Стилі так, як їх показує таба й вотчер: один словник для всіх входів.

    Лише те, що потрібно, щоб вибрати стиль: назва, скільки слів на екран,
    чи є підсвітка. Параметри вигляду лишаються тут, у STYLES."""
    return {
        "default": DEFAULT_STYLE,
        "styles": [
            {
                "id": name,
                "words_per_chunk": style["words_per_chunk"],
                "highlight": bool(style["highlight"]),
            }
            for name, style in STYLES.items()
        ],
    }


def check_setup() -> dict:
    """Чого бракує на цій машині, реченнями для людини. Без винятків назовні:
    сервер показує це в панелі замість того, щоб падати на першому файлі."""
    missing: list[str] = []
    deps = missing_dependencies()
    if deps:
        missing.append("не встановлено " + ", ".join(deps) + " — запусти ./setup.sh")
    try:
        find_ffmpeg()
    except RuntimeError as exc:
        missing.append(str(exc).replace("\n", " "))
    font = FONTS_DIR / "MontserratSubs.ttf"
    if not font.exists():
        missing.append(f"немає {font.name} у technical/fonts — запусти ./setup.sh")
    return {"ok": not missing, "missing": missing}


def main() -> int:
    parser = argparse.ArgumentParser(description="Субтитри у відео через mlx-whisper + ffmpeg")
    parser.add_argument("video", type=Path, nargs="?")
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--lang", default=None, help="en, uk, ru… (за замовчуванням — автовизначення)")
    parser.add_argument("--style", default=DEFAULT_STYLE, choices=sorted(STYLES))
    parser.add_argument("--font", default=None,
                        help="перекрити шрифт стилю (за замовчуванням — той, що в стилі)")
    parser.add_argument("--keep-ass", action="store_true", help="зберегти .ass поруч із відео")
    parser.add_argument("--list-styles", action="store_true",
                        help="надрукувати стилі як JSON і вийти (працює без venv)")
    parser.add_argument("--check", action="store_true",
                        help="перевірити оточення і надрукувати JSON: чого бракує")
    args = parser.parse_args()

    if args.list_styles:
        print(json.dumps(style_catalogue(), ensure_ascii=False))
        return 0
    if args.check:
        result = check_setup()
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["ok"] else 2

    if args.video is None:
        parser.error("потрібен файл відео (або --list-styles / --check)")
    if not args.video.exists():
        print(f"Немає файлу: {args.video}", file=sys.stderr)
        return 1

    output = args.output or args.video.with_name(f"{args.video.stem}.{args.style}.mp4")
    result = process(args.video, output, args.lang, args.style, args.font, args.keep_ass)
    print(f"Готово: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
