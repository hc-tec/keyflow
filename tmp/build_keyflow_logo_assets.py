from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ANDROID_RES = ROOT / "TODO" / "ime-research" / "repos" / "fcitx5-android" / "app" / "src" / "main" / "res"
PREVIEW_DIR = Path(__file__).resolve().parent / "keyflow-logo"

LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def rounded_square_bounds(size: int) -> tuple[float, float, float, float]:
    inset = size * 0.145
    return inset, inset, size - inset, size - inset


def k_geometry(size: int) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float], tuple[float, float], float]:
    left, top, right, bottom = rounded_square_bounds(size)
    width = right - left
    height = bottom - top
    stem = (left + width * 0.29, top + height * 0.18), (left + width * 0.29, bottom - height * 0.18)
    joint = (left + width * 0.46, top + height * 0.50)
    upper = (left + width * 0.73, top + height * 0.22)
    lower = (left + width * 0.73, top + height * 0.78)
    stroke = width * 0.18
    return stem[0], stem[1], upper, lower, stroke


def draw_round_cap_segment(draw: ImageDraw.ImageDraw, start: tuple[float, float], end: tuple[float, float], width: int, fill: tuple[int, int, int, int]) -> None:
    radius = width // 2
    draw.line([start, end], fill=fill, width=width)
    draw.ellipse((start[0] - radius, start[1] - radius, start[0] + radius, start[1] + radius), fill=fill)
    draw.ellipse((end[0] - radius, end[1] - radius, end[0] + radius, end[1] + radius), fill=fill)


def render_badge_icon(size: int, circle: bool = False, supersample: int = 4) -> Image.Image:
    canvas = Image.new("RGBA", (size * supersample, size * supersample), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = rounded_square_bounds(size * supersample)
    if circle:
        draw.ellipse((left, top, right, bottom), fill=BLACK)
    else:
        radius = int((right - left) * 0.18)
        draw.rounded_rectangle((left, top, right, bottom), radius=radius, fill=BLACK)
    stem_top, stem_bottom, upper, lower, stroke = k_geometry(size * supersample)
    joint = ((stem_top[0] + stroke * 0.85), (stem_top[1] + stem_bottom[1]) / 2)
    stroke_px = int(stroke)
    draw_round_cap_segment(draw, stem_top, stem_bottom, stroke_px, WHITE)
    draw_round_cap_segment(draw, joint, upper, stroke_px, WHITE)
    draw_round_cap_segment(draw, joint, lower, stroke_px, WHITE)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def render_adaptive_foreground(size: int, monochrome: bool = False, supersample: int = 4) -> Image.Image:
    canvas = Image.new("RGBA", (size * supersample, size * supersample), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    stem_top, stem_bottom, upper, lower, stroke = k_geometry(size * supersample)
    joint = ((stem_top[0] + stroke * 0.85), (stem_top[1] + stem_bottom[1]) / 2)
    stroke_px = int(stroke)
    fill = BLACK if monochrome else WHITE
    draw_round_cap_segment(draw, stem_top, stem_bottom, stroke_px, fill)
    draw_round_cap_segment(draw, joint, upper, stroke_px, fill)
    draw_round_cap_segment(draw, joint, lower, stroke_px, fill)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def badge_svg(circle: bool = False) -> str:
    left, top, right, bottom = rounded_square_bounds(1024)
    width = right - left
    stem_top, stem_bottom, upper, lower, stroke = k_geometry(1024)
    joint = ((stem_top[0] + stroke * 0.85), (stem_top[1] + stem_bottom[1]) / 2)
    bg = (
        f'<circle cx="512" cy="512" r="{width / 2:.2f}" fill="#000000" />'
        if circle
        else f'<rect x="{left:.2f}" y="{top:.2f}" width="{width:.2f}" height="{width:.2f}" rx="{width * 0.18:.2f}" fill="#000000" />'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        f"{bg}"
        f'<g fill="none" stroke="#ffffff" stroke-width="{stroke:.2f}" stroke-linecap="round" stroke-linejoin="round">'
        f'<line x1="{stem_top[0]:.2f}" y1="{stem_top[1]:.2f}" x2="{stem_bottom[0]:.2f}" y2="{stem_bottom[1]:.2f}" />'
        f'<line x1="{joint[0]:.2f}" y1="{joint[1]:.2f}" x2="{upper[0]:.2f}" y2="{upper[1]:.2f}" />'
        f'<line x1="{joint[0]:.2f}" y1="{joint[1]:.2f}" x2="{lower[0]:.2f}" y2="{lower[1]:.2f}" />'
        "</g></svg>"
    )


def monochrome_svg() -> str:
    stem_top, stem_bottom, upper, lower, stroke = k_geometry(1024)
    joint = ((stem_top[0] + stroke * 0.85), (stem_top[1] + stem_bottom[1]) / 2)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        f'<g fill="none" stroke="#000000" stroke-width="{stroke:.2f}" stroke-linecap="round" stroke-linejoin="round">'
        f'<line x1="{stem_top[0]:.2f}" y1="{stem_top[1]:.2f}" x2="{stem_bottom[0]:.2f}" y2="{stem_bottom[1]:.2f}" />'
        f'<line x1="{joint[0]:.2f}" y1="{joint[1]:.2f}" x2="{upper[0]:.2f}" y2="{upper[1]:.2f}" />'
        f'<line x1="{joint[0]:.2f}" y1="{joint[1]:.2f}" x2="{lower[0]:.2f}" y2="{lower[1]:.2f}" />'
        "</g></svg>"
    )


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def export_preview_assets() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    render_badge_icon(1024, circle=False).save(PREVIEW_DIR / "keyflow-badge.png")
    render_badge_icon(1024, circle=True).save(PREVIEW_DIR / "keyflow-round.png")
    render_adaptive_foreground(1024, monochrome=False).save(PREVIEW_DIR / "keyflow-adaptive-foreground.png")
    render_adaptive_foreground(1024, monochrome=True).save(PREVIEW_DIR / "keyflow-adaptive-monochrome.png")
    write_text(PREVIEW_DIR / "keyflow-badge.svg", badge_svg(circle=False))
    write_text(PREVIEW_DIR / "keyflow-round.svg", badge_svg(circle=True))
    write_text(PREVIEW_DIR / "keyflow-monochrome.svg", monochrome_svg())


def export_android_mipmaps() -> None:
    for density, size in LEGACY_SIZES.items():
        mipmap_dir = ANDROID_RES / f"mipmap-{density}"
        render_badge_icon(size, circle=False).save(mipmap_dir / "ic_launcher.png")
        render_badge_icon(size, circle=False).save(mipmap_dir / "ic_launcher_debug.png")
        render_badge_icon(size, circle=True).save(mipmap_dir / "ic_launcher_round.png")
        render_badge_icon(size, circle=True).save(mipmap_dir / "ic_launcher_round_debug.png")

    for density, size in ADAPTIVE_SIZES.items():
        mipmap_dir = ANDROID_RES / f"mipmap-{density}"
        render_adaptive_foreground(size, monochrome=False).save(mipmap_dir / "ic_launcher_foreground.png")
        render_adaptive_foreground(size, monochrome=False).save(mipmap_dir / "ic_launcher_foreground_debug.png")
        render_adaptive_foreground(size, monochrome=True).save(mipmap_dir / "ic_launcher_foreground_monochrome.png")
        render_adaptive_foreground(size, monochrome=True).save(mipmap_dir / "ic_launcher_foreground_monochrome_debug.png")


def write_adaptive_icon_xml(name: str, foreground: str, monochrome: str) -> None:
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@android:color/black" />\n'
        f'    <foreground android:drawable="@mipmap/{foreground}" />\n'
        f'    <monochrome android:drawable="@mipmap/{monochrome}" />\n'
        '</adaptive-icon>\n'
    )
    write_text(ANDROID_RES / "mipmap-anydpi-v26" / name, xml)


def apply_android_resources() -> None:
    export_android_mipmaps()
    write_adaptive_icon_xml("ic_launcher.xml", "ic_launcher_foreground", "ic_launcher_foreground_monochrome")
    write_adaptive_icon_xml("ic_launcher_round.xml", "ic_launcher_foreground", "ic_launcher_foreground_monochrome")
    write_adaptive_icon_xml("ic_launcher_debug.xml", "ic_launcher_foreground_debug", "ic_launcher_foreground_monochrome_debug")
    write_adaptive_icon_xml("ic_launcher_round_debug.xml", "ic_launcher_foreground_debug", "ic_launcher_foreground_monochrome_debug")


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild clean Keyflow logo assets from the uploaded reference mark.")
    parser.add_argument("--apply-android-res", action="store_true", help="Overwrite fcitx5-android launcher assets.")
    args = parser.parse_args()

    export_preview_assets()
    if args.apply_android_res:
        apply_android_resources()


if __name__ == "__main__":
    main()
