"""
rough.py — a tiny Excalidraw-flavoured SVG generator.

Why hand-rolled: cairosvg / rsvg / roughjs are all unavailable in this sandbox,
and GitHub renders repo-relative SVG through an <img> in "secure static mode" --
scripts, external fonts and external refs are blocked, internal defs and
presentation attributes are fine. So everything here is plain geometry plus
presentation attributes, no <style>, no @font-face, no <foreignObject>.

Determinism matters: the jitter comes from a seeded LCG keyed on the shape's own
coordinates, so regenerating a diagram produces byte-identical output and git
diffs stay empty unless the drawing actually changed.
"""

import math

# Handwriting first, then progressively duller fallbacks. Whatever the reader
# has installed wins; the final sans-serif guarantees text always renders.
HAND = ("Segoe Print,Bradley Hand,Comic Sans MS,Chalkboard SE,"
        "Comic Neue,Chalkboard,Verdana,sans-serif")
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,DejaVu Sans Mono,monospace"


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _rgb(c):
    c = str(c).lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def mix(fg, bg, a):
    """Flatten fg-over-bg at alpha `a` into one solid hex colour.

    Everything is pre-blended rather than emitted as fill-opacity /
    stroke-opacity. Two reasons: some SVG rasterisers (ImageMagick's internal
    MSVG among them) silently drop those attributes, which made the QA render
    disagree with the browser; and overlapping translucent strokes in a
    two-pass sketchy outline darken where they cross, which reads as a smudge.
    Solid colours render identically everywhere.
    """
    if a >= 0.999:
        return fg if str(fg).startswith("#") else fg
    a = max(0.0, min(1.0, float(a)))
    fr, fg_, fb = _rgb(fg)
    br, bg_, bb = _rgb(bg)
    return "#%02x%02x%02x" % (
        int(round(fr * a + br * (1 - a))),
        int(round(fg_ * a + bg_ * (1 - a))),
        int(round(fb * a + bb * (1 - a))),
    )


class Rng:
    """Deterministic LCG. Seeded per-shape so shapes are independent."""

    def __init__(self, seed):
        self.s = (int(seed) & 0x7FFFFFFF) or 1

    def next(self):
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def sym(self, amp):
        """Uniform in [-amp, +amp]."""
        return (self.next() * 2.0 - 1.0) * amp


def _seed(*nums):
    h = 2166136261
    for n in nums:
        h = (h ^ int(round(float(n) * 7.0))) * 16777619 & 0xFFFFFFFF
    return h


def _clip_seg(x1, y1, x2, y2, xmin, ymin, xmax, ymax):
    """Liang-Barsky. Returns the in-rect portion of the segment, or None."""
    dx, dy = x2 - x1, y2 - y1
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x1 - xmin), (dx, xmax - x1),
                 (-dy, y1 - ymin), (dy, ymax - y1)):
        if p == 0.0:
            if q < 0.0:
                return None
        else:
            t = q / p
            if p < 0.0:
                if t > t1:
                    return None
                t0 = max(t0, t)
            else:
                if t < t0:
                    return None
                t1 = min(t1, t)
    return (x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy)


def f(v):
    """Compact fixed-point so the SVG stays small and stable."""
    return ("%.2f" % v).rstrip("0").rstrip(".")


class Canvas:
    def __init__(self, w, h, bg="#12141c"):
        self.w, self.h, self.bg = w, h, bg
        # What translucent colours get flattened against.
        self.blend = bg or "#12141c"
        self.parts = []
        self.defs = []

    # ---------------------------------------------------------------- raw

    def raw(self, s):
        self.parts.append(s)

    def defn(self, s):
        self.defs.append(s)

    # ------------------------------------------------------------ strokes

    def _wobble(self, x1, y1, x2, y2, rng, amp):
        """One sketchy stroke from A to B as a quadratic bezier.

        The control point sits near the midpoint but pushed off the straight
        line, which is what reads as a hand-drawn bow rather than a ruler line.
        """
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy) or 1.0
        # perpendicular unit vector
        px, py = -dy / ln, dx / ln
        bow = rng.sym(amp) * min(1.0, ln / 90.0)
        cx = mx + px * bow + rng.sym(amp * 0.4)
        cy = my + py * bow + rng.sym(amp * 0.4)
        return ("M%s %s Q%s %s %s %s"
                % (f(x1 + rng.sym(amp * 0.5)), f(y1 + rng.sym(amp * 0.5)),
                   f(cx), f(cy),
                   f(x2 + rng.sym(amp * 0.5)), f(y2 + rng.sym(amp * 0.5))))

    def line(self, x1, y1, x2, y2, stroke="#e6e8ef", w=2.0, amp=1.6,
             passes=2, dash=None, opacity=1.0, cap="round"):
        rng = Rng(_seed(x1, y1, x2, y2, w))
        d = " ".join(self._wobble(x1, y1, x2, y2, rng, amp)
                     for _ in range(passes))
        extra = ' stroke-dasharray="%s"' % dash if dash else ""
        self.raw('<path d="%s" fill="none" stroke="%s" stroke-width="%s" '
                 'stroke-linecap="%s"%s/>'
                 % (d, mix(stroke, self.blend, opacity), f(w), cap, extra))

    # -------------------------------------------------------------- shapes

    def _round_path(self, x, y, w, h, r, rng, amp):
        """Rounded-rect outline, jittered, corners as quadratics."""
        r = min(r, w / 2.0, h / 2.0)
        j = lambda v: v + rng.sym(amp)  # noqa: E731
        p = []
        p.append("M%s %s" % (f(j(x + r)), f(j(y))))
        p.append("L%s %s" % (f(j(x + w - r)), f(j(y))))
        p.append("Q%s %s %s %s" % (f(x + w), f(y), f(j(x + w)), f(j(y + r))))
        p.append("L%s %s" % (f(j(x + w)), f(j(y + h - r))))
        p.append("Q%s %s %s %s" % (f(x + w), f(y + h),
                                   f(j(x + w - r)), f(j(y + h))))
        p.append("L%s %s" % (f(j(x + r)), f(j(y + h))))
        p.append("Q%s %s %s %s" % (f(x), f(y + h), f(j(x)), f(j(y + h - r))))
        p.append("L%s %s" % (f(j(x)), f(j(y + r))))
        p.append("Q%s %s %s %s" % (f(x), f(y), f(j(x + r)), f(j(y))))
        p.append("Z")
        return " ".join(p)

    def rect(self, x, y, w, h, stroke="#8b93a7", fill=None, fill_op=0.16,
             sw=2.0, r=10, amp=1.5, passes=2, hachure_gap=0,
             stroke_op=1.0, dash=None):
        rng = Rng(_seed(x, y, w, h))
        backdrop = self.blend
        if fill:
            # Fill uses the clean outline: a jittered fill edge looks muddy
            # under a sketchy stroke that already overshoots the corners.
            clean = Rng(0)
            backdrop = mix(fill, self.blend, fill_op)
            self.raw('<path d="%s" fill="%s" stroke="none"/>'
                     % (self._round_path(x, y, w, h, r, clean, 0.0),
                        backdrop))
        if hachure_gap:
            # Shade against the tint we just laid down, not the page, or the
            # hatching reads too dark inside a filled box.
            self.hachure(x, y, w, h, stroke, hachure_gap, backdrop=backdrop)
        d = " ".join(self._round_path(x, y, w, h, r, rng, amp)
                     for _ in range(passes))
        extra = ' stroke-dasharray="%s"' % dash if dash else ""
        self.raw('<path d="%s" fill="none" stroke="%s" stroke-width="%s" '
                 'stroke-linejoin="round" stroke-linecap="round"%s/>'
                 % (d, mix(stroke, self.blend, stroke_op), f(sw), extra))

    def hachure(self, x, y, w, h, color, gap=9, angle=-45, sw=1.0, op=0.30,
                backdrop=None):
        """Excalidraw's diagonal shading.

        Clipped by geometry (Liang-Barsky per segment) rather than by a
        <clipPath>. ImageMagick's MSVG renderer ignores clip-path outright and
        the hatching bled across the whole canvas; rather than trust that every
        renderer honours it, the segments are simply never generated outside
        the box. Inset a few px so the sketchy wobble cannot poke through the
        border either.
        """
        pad = 4.0
        xmin, ymin = x + pad, y + pad
        xmax, ymax = x + w - pad, y + h - pad
        if xmax <= xmin or ymax <= ymin:
            return
        t = math.tan(math.radians(abs(angle)))
        segs = []
        k = -h * t
        i = 0
        while k < w + h * t:
            seg = _clip_seg(x + k, y + h, x + k + h * t, y,
                            xmin, ymin, xmax, ymax)
            if seg and math.hypot(seg[2] - seg[0], seg[3] - seg[1]) > 2.0:
                rng = Rng(_seed(x, y, k, i))
                segs.append(self._wobble(seg[0], seg[1], seg[2], seg[3],
                                         rng, 0.8))
            k += gap
            i += 1
        if not segs:
            return
        self.raw('<path d="%s" fill="none" stroke="%s" stroke-width="%s" '
                 'stroke-linecap="round"/>'
                 % (" ".join(segs),
                    mix(color, backdrop or self.blend, op), f(sw)))

    def arrow(self, pts, stroke="#e6e8ef", w=2.2, amp=1.4, head=11,
              dash=None, opacity=1.0):
        """Polyline arrow with a two-stroke sketchy head on the last segment."""
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            self.line(x1, y1, x2, y2, stroke, w, amp, 2, dash, opacity)
        (hx1, hy1), (hx2, hy2) = pts[-2], pts[-1]
        ang = math.atan2(hy2 - hy1, hx2 - hx1)
        for sign in (1, -1):
            a = ang + sign * math.radians(155)
            self.line(hx2, hy2, hx2 + math.cos(a) * head,
                      hy2 + math.sin(a) * head, stroke, w, 0.8, 2,
                      None, opacity)

    def ellipse(self, cx, cy, rx, ry, stroke="#e6e8ef", fill=None,
                fill_op=0.16, sw=2.0, amp=1.6, passes=2):
        rng = Rng(_seed(cx, cy, rx, ry))
        if fill:
            self.raw('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"/>'
                     % (f(cx), f(cy), f(rx), f(ry),
                        mix(fill, self.blend, fill_op)))
        ds = []
        for _ in range(passes):
            pts = []
            n = 18
            for i in range(n + 1):
                t = 2 * math.pi * i / n
                pts.append((cx + math.cos(t) * rx + rng.sym(amp),
                            cy + math.sin(t) * ry + rng.sym(amp)))
            d = "M%s %s" % (f(pts[0][0]), f(pts[0][1]))
            for i in range(1, len(pts) - 1):
                mx = (pts[i][0] + pts[i + 1][0]) / 2.0
                my = (pts[i][1] + pts[i + 1][1]) / 2.0
                d += " Q%s %s %s %s" % (f(pts[i][0]), f(pts[i][1]),
                                        f(mx), f(my))
            ds.append(d + " Z")
        self.raw('<path d="%s" fill="none" stroke="%s" stroke-width="%s" '
                 'stroke-linecap="round"/>' % (" ".join(ds), stroke, f(sw)))

    # ---------------------------------------------------------------- text

    def text(self, x, y, s, size=15, fill="#e6e8ef", anchor="middle",
             weight="normal", family=HAND, op=1.0, ls=None, italic=False):
        extra = ""
        if ls is not None:
            extra += ' letter-spacing="%s"' % f(ls)
        if italic:
            extra += ' font-style="italic"'
        self.raw('<text x="%s" y="%s" font-family="%s" font-size="%s" '
                 'font-weight="%s" fill="%s" text-anchor="%s"%s>%s</text>'
                 % (f(x), f(y), family, f(size), weight,
                    mix(fill, self.blend, op), anchor, extra, esc(s)))

    def lines(self, x, y, rows, size=14, fill="#e6e8ef", anchor="middle",
              lh=1.35, weight="normal", family=HAND, op=1.0):
        for i, row in enumerate(rows):
            self.text(x, y + i * size * lh, row, size, fill, anchor,
                      weight, family, op)

    # --------------------------------------------------------------- width

    @staticmethod
    def width(s, size, family=HAND):
        """Conservative advance-width estimate.

        Deliberately pessimistic: the handwriting fonts in the stack are wide
        (Comic Sans averages ~0.58em, Segoe Print wider still), and a box that
        is slightly too big is invisible while one that is too small clips.
        """
        per = 0.62 if family == HAND else 0.60
        wide, narrow = "MWQ@%_", "iljt.,'!|:;"
        total = 0.0
        for ch in str(s):
            if ch in wide:
                total += per * 1.35
            elif ch in narrow:
                total += per * 0.45
            elif ch.isupper():
                total += per * 1.12
            else:
                total += per
        return total * size

    def fits(self, s, size, box_w, pad=18, family=HAND, label=""):
        """Assert text fits its box; returns the overflow in px (0 = fine)."""
        need = self.width(s, size, family) + pad * 2
        over = need - box_w
        if over > 0:
            print("  OVERFLOW %-28s %+6.1fpx  %r"
                  % (label or "?", over, str(s)[:52]))
        return max(0.0, over)

    # ----------------------------------------------------------------- out

    def svg(self):
        head = ('<svg xmlns="http://www.w3.org/2000/svg" '
                'viewBox="0 0 %d %d" width="%d" height="%d" '
                'role="img" aria-label="HedgeFi diagram">'
                % (self.w, self.h, self.w, self.h))
        defs = ("<defs>%s</defs>" % "".join(self.defs)) if self.defs else ""
        bg = ('<rect width="%d" height="%d" rx="14" fill="%s"/>'
              % (self.w, self.h, self.bg)) if self.bg else ""
        return "\n".join([head, defs, bg] + self.parts + ["</svg>", ""])

    def save(self, path):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(self.svg())
        print("  wrote %s (%d bytes)" % (path, len(self.svg())))


# --------------------------------------------------------------- palette

BG = "#12141c"
PANEL = "#1a1d29"
INK = "#e8eaf2"
DIM = "#98a0b8"
FAINT = "#5c6480"

BLUE = "#5aa2ff"
GREEN = "#3ddc84"
ORANGE = "#ffa53b"
PURPLE = "#c084fc"
PINK = "#ff6fae"
TEAL = "#2dd4bf"
YELLOW = "#ffd93d"
RED = "#ff5f56"
CYAN = "#4ad9e4"
VIOLET = "#8b7bff"


def group(cv, x, y, w, h, colour, title, rows, sub=None, gap=9,
          title_size=17, row_size=14, r=14):
    """A colour-coded Excalidraw box: hachured fill, title, member rows."""
    cv.rect(x, y, w, h, stroke=colour, fill=colour, fill_op=0.10,
            sw=2.6, r=r, hachure_gap=gap)
    cv.text(x + w / 2, y + 30, title, title_size, colour, "middle", "bold")
    cv.fits(title, title_size, w, 14, HAND, "title:" + title)
    ty = y + 56
    if sub:
        cv.text(x + w / 2, ty, sub, 12, DIM, "middle", "normal", HAND, 0.95)
        cv.fits(sub, 12, w, 12, HAND, "sub:" + title)
        ty += 20
    for row in rows:
        cv.text(x + w / 2, ty, row, row_size, INK, "middle", "normal",
                MONO, 0.92)
        cv.fits(row, row_size, w, 12, MONO, "row:" + row)
        ty += row_size * 1.5
    return ty
