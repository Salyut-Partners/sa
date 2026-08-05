#!/usr/bin/env python3
"""Запікає статичний шрифт із варіативного.

Навіщо: у варіативного шрифту є дефолтний інстанс, і саме його бере libass,
ігноруючи іменовані інстанси. У Montserrat дефолт — Thin, тому субтитри
виходили тонкими попри Bold=1. Тут потрібна вага «запікається» в окремий файл
з унікальною назвою сімʼї, щоб фільтр ass брав саме його.

Без аргументів робить Montserrat Subs (ExtraBold) — те, чим малюються
стандартні стилі. Для іншого шрифту:

    ./.venv/bin/python make_font.py --source ~/Library/Fonts/Inter[wght].ttf \
        --weight 700 --family "Inter Subs"

Статичні шрифти запікати не треба — просто поклади .ttf у fonts/
і вкажи назву сімʼї в ключі "font" потрібного стилю.
"""

import argparse
import sys
from pathlib import Path

from fontTools import ttLib
from fontTools.varLib import instancer

SOURCE_CANDIDATES = [
    Path.home() / "Library/Fonts/Montserrat[wght].ttf",
    Path("/Library/Fonts/Montserrat[wght].ttf"),
]
FONTS_DIR = Path(__file__).resolve().parent / "fonts"
FAMILY = "Montserrat Subs"
WEIGHT = 800  # ExtraBold — читабельно на будь-якому фоні


def rename(font: ttLib.TTFont, family: str) -> None:
    name = font["name"]
    postscript = family.replace(" ", "")
    for record_id, value in (
        (1, family), (2, "Regular"), (3, f"{family}:custom"),
        (4, family), (6, postscript), (16, family), (17, "Regular"),
    ):
        name.setName(value, record_id, 3, 1, 0x409)
        name.setName(value, record_id, 1, 0, 0)


def bake(source: Path, weight: int, family: str, target: Path) -> None:
    font = ttLib.TTFont(source)
    if "fvar" not in font:
        raise SystemExit(f"{source.name} не варіативний — його можна класти в fonts/ як є")
    static = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=False)
    rename(static, family)
    static["OS/2"].usWeightClass = weight
    target.parent.mkdir(parents=True, exist_ok=True)
    static.save(target)


def main() -> int:
    parser = argparse.ArgumentParser(description="Статичний шрифт із варіативного")
    parser.add_argument("--source", type=Path, default=None,
                        help="варіативний .ttf (за замовчуванням — Montserrat із каску)")
    parser.add_argument("--weight", type=int, default=WEIGHT, help="вага, напр. 700 або 800")
    parser.add_argument("--family", default=FAMILY,
                        help="назва сімʼї — її ж вказувати в ключі \"font\" стилю")
    parser.add_argument("--out", type=Path, default=None,
                        help="куди зберегти (за замовчуванням fonts/<Сімʼя без пробілів>.ttf)")
    args = parser.parse_args()

    source = args.source
    if source is None:
        source = next((p for p in SOURCE_CANDIDATES if p.exists()), None)
        if source is None:
            print("Не знайдено Montserrat[wght].ttf. Постав: brew install --cask font-montserrat",
                  file=sys.stderr)
            return 1
    if not source.exists():
        print(f"Немає файлу: {source}", file=sys.stderr)
        return 1

    target = args.out or FONTS_DIR / f"{args.family.replace(' ', '')}.ttf"
    bake(source, args.weight, args.family, target)
    print(f"Готово: {target}  (сімʼя «{args.family}», вага {args.weight})")
    print(f'У стилі: "font": "{args.family}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
