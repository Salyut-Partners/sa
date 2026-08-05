#!/usr/bin/env python3
"""Робить статичний жирний Montserrat із варіативного шрифту.

Варіативний Montserrat[wght].ttf має дефолтний інстанс Thin (100), тож libass
рендерить субтитри тонкими. Тут ми «запікаємо» потрібну вагу в окремий файл
з унікальною назвою сімʼї — щоб фільтр ass брав саме його.
"""

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
    full = family
    postscript = family.replace(" ", "")
    for record_id, value in (
        (1, family), (2, "Regular"), (3, f"{family}:custom"),
        (4, full), (6, postscript), (16, family), (17, "Regular"),
    ):
        name.setName(value, record_id, 3, 1, 0x409)
        name.setName(value, record_id, 1, 0, 0)


def main() -> int:
    source = next((p for p in SOURCE_CANDIDATES if p.exists()), None)
    if source is None:
        print("Не знайдено Montserrat[wght].ttf. Постав: brew install --cask font-montserrat",
              file=sys.stderr)
        return 1

    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    target = FONTS_DIR / "MontserratSubs.ttf"

    font = ttLib.TTFont(source)
    static = instancer.instantiateVariableFont(font, {"wght": WEIGHT}, updateFontNames=False)
    rename(static, FAMILY)
    static["OS/2"].usWeightClass = WEIGHT
    static.save(target)

    print(f"Готово: {target}  (сімʼя «{FAMILY}», вага {WEIGHT})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
