from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


DEFAULT_SIZES = [48, 64, 96, 128, 256]
DEFAULT_PADDING = 0.14
DEFAULT_THRESHOLD = 26


def parse_sizes(raw: str) -> list[int]:
    values = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        value = int(token)
        if value <= 0:
            raise ValueError(f"invalid icon size: {token}")
        values.append(value)
    if not values:
        raise ValueError("no icon sizes provided")
    return sorted(dict.fromkeys(values))


def parse_background_mode(raw: str) -> tuple[str, tuple[int, int, int] | None]:
    mode = raw.strip().lower()
    if mode in {"none", "auto", "black", "white"}:
        return mode, None
    if mode.startswith("#") and len(mode) == 7:
        try:
            return "rgb", tuple(int(mode[index:index + 2], 16) for index in (1, 3, 5))
        except ValueError as exc:
            raise ValueError(f"invalid background color: {raw}") from exc
    raise ValueError(f"unsupported background mode: {raw}")


def sample_background_color(image: Image.Image, mode: str, explicit_rgb: tuple[int, int, int] | None) -> tuple[int, int, int] | None:
    if mode == "none":
        return None
    if mode == "black":
        return (0, 0, 0)
    if mode == "white":
        return (255, 255, 255)
    if mode == "rgb":
        return explicit_rgb

    width, height = image.size
    points = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (width // 2, height - 1),
        (0, height // 2),
        (width - 1, height // 2),
    ]
    colors = [image.getpixel(point)[:3] for point in points]
    return tuple(sum(channel) // len(colors) for channel in zip(*colors))


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def remove_edge_background(image: Image.Image, background: tuple[int, int, int], threshold: int) -> Image.Image:
    width, height = image.size
    rgba = image.copy().convert("RGBA")
    pixels = rgba.load()
    visited = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if visited[y][x]:
            return
        current = pixels[x, y]
        if current[3] == 0:
            visited[y][x] = True
            return
        if color_distance(current[:3], background) <= threshold:
            visited[y][x] = True
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                enqueue(nx, ny)

    return rgba


def trim_transparent_bounds(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    return image.crop(bbox) if bbox else image


def fit_icon(source: Image.Image, size: int, padding: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    usable = max(1, round(size * (1 - padding * 2)))
    fitted = source.copy()
    fitted.thumbnail((usable, usable), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def update_manifest(manifest_path: Path, size_map: dict[int, str]) -> None:
    data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    data["icons"] = {str(size): path for size, path in size_map.items()}
    preferred_size = 128 if 128 in size_map else sorted(size_map.keys())[-1]
    data["icon"] = size_map[preferred_size]
    manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_icon_set(
    src: Path,
    output_dir: Path,
    sizes: list[int],
    padding: float,
    background_mode: str,
    explicit_background: tuple[int, int, int] | None,
    threshold: int,
) -> dict[int, Path]:
    image = Image.open(src).convert("RGBA")
    sampled_background = sample_background_color(image, background_mode, explicit_background)
    if sampled_background is not None:
        image = remove_edge_background(image, sampled_background, threshold)
    image = trim_transparent_bounds(image)

    output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[int, Path] = {}
    for size in sizes:
        target = output_dir / f"icon-{size}.png"
        fit_icon(image, size, padding).save(target)
        results[size] = target
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate multi-size Function Kit icons from one source image.")
    parser.add_argument("--src", required=True, help="source image path")
    parser.add_argument("--kit-dir", required=True, help="Function Kit directory that contains manifest.json")
    parser.add_argument("--sizes", default="48,64,96,128,256", help="comma-separated icon sizes")
    parser.add_argument("--padding", type=float, default=DEFAULT_PADDING, help="relative transparent padding around the icon")
    parser.add_argument(
        "--background",
        default="auto",
        help="background removal mode: auto | none | black | white | #RRGGBB",
    )
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD, help="background removal tolerance")
    args = parser.parse_args()

    src = Path(args.src).resolve()
    kit_dir = Path(args.kit_dir).resolve()
    manifest_path = kit_dir / "manifest.json"
    icons_dir = kit_dir / "icons"

    if not src.is_file():
        raise FileNotFoundError(f"source image not found: {src}")
    if not manifest_path.is_file():
        raise FileNotFoundError(f"manifest not found: {manifest_path}")

    sizes = parse_sizes(args.sizes)
    background_mode, explicit_background = parse_background_mode(args.background)
    generated = build_icon_set(
        src=src,
        output_dir=icons_dir,
        sizes=sizes,
        padding=args.padding,
        background_mode=background_mode,
        explicit_background=explicit_background,
        threshold=args.threshold,
    )
    relative_map = {size: f"icons/{path.name}" for size, path in generated.items()}
    update_manifest(manifest_path, relative_map)

    print(f"[icon-set] source={src}")
    print(f"[icon-set] kit={kit_dir}")
    for size, path in generated.items():
        print(f"[icon-set] {size}px -> {path}")
    print(f"[icon-set] manifest updated -> {manifest_path}")


if __name__ == "__main__":
    main()
