"""Character + creature sprites: 4-direction walk cycles, hand-tuned silhouettes."""
import math, random
from artlib import Img, C, T, mix, OUTL

SHADOW = (14, 12, 20, 70)

# --- palette: strong value separation so parts never merge ---
# Full 4-5 step ramps: shadow / base / mid / light / spec.
SK_S, SK_D, SK_M, SK_L = C('#8f5636'), C('#b87a52'), C('#dfa876'), C('#f6d2a6')
HR_S, HR_D, HR_M, HR_L = C('#1d110a'), C('#2e1c12'), C('#4a2e1c'), C('#71492b')
CL_S, CL_D, CL_M, CL_L = C('#4e1a1c'), C('#7a2f2c'), C('#b04a38'), C('#d97a4e')
TU_S, TU_D, TU_M, TU_L = C('#9a7c46'), C('#c8a86a'), C('#e6cf98'), C('#f9f0cc')
PA_S, PA_D, PA_M, PA_L = C('#1e2030'), C('#2f3040'), C('#43455c'), C('#5b5e78')
BO_S, BO_D, BO_M = C('#120e0a'), C('#1d1712'), C('#3d2c1e')
LEATH = C('#6b4526')      # belt / straps
BUCK = C('#e0b640')       # brass
STEEL_D, STEEL_M, STEEL_L = C('#5a6070'), C('#8f96a6'), C('#c9d0de')
GOLD = C('#c9a227')
EYE = C('#17151c')

W, H = 20, 30
FEET = 26


def _shadow(img, rx=5.4, ry=2.0, cy=None):
    img.ellipse(img.w / 2, cy if cy is not None else FEET + 1, rx, ry, SHADOW)


def _boot(img, x, y, w, facing_side, flip=False):
    """Boot with a cuff, sole and a lit top edge."""
    img.rect(x, y, w, 3, BO_D)          # upper
    img.rect(x, y, w, 1, BO_M)          # lit cuff
    img.rect(x, y + 3, w, 1, BO_S)      # sole shadow
    if facing_side:
        tx = x + w - 1 if not flip else x
        img.set(tx, y + 2, BO_M)        # toe catch-light


def _leg(img, x, y, h, front):
    """Trouser leg: dark seam on one side, mid tone, lit strip."""
    base = PA_M if front else PA_D
    img.rect(x, y, 3, h, base)
    img.vline(x, y, h, PA_S)                       # inner shadow seam
    img.vline(x + 1, y, h, PA_L if front else PA_M)  # lit strip
    if h > 3:
        img.set(x + 2, y + h - 2, PA_S)            # ankle shading


def _fold(img, x, y, w, c):
    """A short horizontal crease in cloth."""
    img.hline(x, y, w, c)


def player_frame(direction, step, act='walk', hair=0):
    """direction: 0=S 1=W 2=N 3=E ; step 0..3 ; hair = style index."""
    img = Img(W, H)
    walking = act == 'walk'
    bob = [0, -1, 0, -1][step] if walking else 0
    phase = [0, 1, 0, -1][step] if walking else 0
    breathe = 0 if walking else (1 if step % 2 else 0)

    _shadow(img, rx=5.6 - abs(bob) * .3)
    cx = 10
    hd_top = 2 + bob
    tor_top = hd_top + 9          # 8 rows of head + 1 row of neck
    leg_top = tor_top + 9
    side = direction in (1, 3)

    # ================================================= cloak (behind body)
    sway = phase
    if direction == 2:                                   # full cape from behind
        img.rect(cx - 6, tor_top - 1, 12, 14, CL_M)
        img.rect(cx - 6, tor_top - 1, 4, 14, CL_L)       # lit left panel
        img.rect(cx + 3, tor_top - 1, 3, 14, CL_D)       # shaded right panel
        # vertical drape folds
        for fx in (cx - 4, cx - 1, cx + 2):
            img.vline(fx, tor_top + 1, 10, CL_D)
            img.vline(fx + 1, tor_top + 1, 10, CL_M)
        # hem catches light, waves with the stride
        hemy = tor_top + 13 + (1 if sway > 0 else 0)
        img.hline(cx - 6, hemy, 12, CL_S)
        img.hline(cx - 6, hemy - 1, 12, CL_D)
        img.set(cx - 5, hemy - 1, CL_L); img.set(cx + 3, hemy - 1, CL_L)
    elif side:                                           # trailing behind
        bx = cx - 7
        img.rect(bx, tor_top - 1, 5, 12, CL_M)
        img.rect(bx, tor_top - 1, 2, 12, CL_L)
        img.rect(bx + 4, tor_top - 1, 1, 12, CL_D)
        img.vline(bx + 2, tor_top + 1, 9, CL_D)
        # tail flicks with the walk cycle
        img.rect(bx - 1 - max(0, sway), tor_top + 5, 2, 6, CL_D)
        img.set(bx - 1 - max(0, sway), tor_top + 5, CL_M)
        img.hline(bx, tor_top + 11, 5, CL_S)
    else:                                                # front: shoulders + edges
        img.rect(cx - 6, tor_top - 1, 2, 12 + (1 if sway > 0 else 0), CL_M)
        img.rect(cx + 4, tor_top - 1, 2, 12 + (0 if sway > 0 else 1), CL_M)
        img.vline(cx - 6, tor_top - 1, 12, CL_L)
        img.vline(cx + 5, tor_top - 1, 12, CL_D)
        img.vline(cx - 5, tor_top + 2, 9, CL_D)
        img.vline(cx + 4, tor_top + 2, 9, CL_S)
        # collar wraps the shoulders
        img.hline(cx - 6, tor_top - 1, 12, CL_M)
        img.hline(cx - 6, tor_top - 1, 4, CL_L)
        img.hline(cx - 6, tor_top, 12, CL_D)

    # ================================================= legs
    if side:
        for i, off in enumerate([phase, -phase]):
            lx = cx - 2 + int(round(off * 2))
            sh = int(abs(off) * 1.5)
            _leg(img, lx, leg_top, 6 - sh, i == 0)
            _boot(img, lx, leg_top + 6 - sh, 4, True, direction == 1)
    else:
        for sgn in (-1, 1):
            off = phase * sgn
            lift = int(abs(off) * 1.5)
            lx = cx - 4 if sgn < 0 else cx + 1
            _leg(img, lx, leg_top, 6 - lift, sgn > 0)
            _boot(img, lx, leg_top + 6 - lift, 3, False)

    # ================================================= torso / tunic
    ty = tor_top + breathe
    if side:
        img.rect(cx - 3, ty, 7, 9, TU_M)
        img.rect(cx - 3, ty, 2, 9, TU_D)          # back in shadow
        img.rect(cx + 2, ty, 2, 9, TU_L)          # chest catches light
        img.vline(cx - 3, ty, 9, TU_S)
        _fold(img, cx - 3, ty + 3, 5, TU_D)       # chest crease
        _fold(img, cx - 2, ty + 5, 4, TU_D)
    else:
        img.rect(cx - 4, ty, 8, 9, TU_M)
        img.rect(cx - 4, ty, 2, 9, TU_D)
        img.rect(cx + 2, ty, 2, 9, TU_S)
        img.rect(cx - 2, ty + 1, 3, 6, TU_L)      # lit centre panel
        # laced neckline
        img.set(cx - 1, ty, TU_S); img.set(cx, ty, TU_S)
        img.set(cx - 1, ty + 1, TU_D); img.set(cx, ty + 1, TU_D)
        img.set(cx - 1, ty + 2, LEATH); img.set(cx, ty + 3, LEATH)
        _fold(img, cx - 3, ty + 5, 4, TU_D)
        _fold(img, cx + 1, ty + 6, 2, TU_S)
        if direction == 2:                        # backpack over the cape
            img.rect(cx - 3, ty + 1, 7, 8, C('#6b4526'))
            img.rect(cx - 3, ty + 1, 7, 1, C('#8f6135'))
            img.rect(cx - 3, ty + 1, 2, 8, C('#7d5230'))
            img.rect(cx + 2, ty + 1, 2, 8, C('#4f3419'))
            img.hline(cx - 3, ty + 4, 7, C('#43290f'))   # strap
            img.set(cx + 1, ty + 4, BUCK)
            img.rect(cx - 2, ty + 6, 3, 2, C('#7d5230'))  # pocket
            img.hline(cx - 2, ty + 6, 3, C('#8f6135'))
            # bedroll lashed on top
            img.rect(cx - 3, ty - 1, 6, 2, C('#8a7a58'))
            img.hline(cx - 3, ty - 1, 6, C('#a89770'))

    # belt
    by2 = ty + 7
    img.hline(cx - 4 if not side else cx - 3, by2, 8 if not side else 7, LEATH)
    img.hline(cx - 4 if not side else cx - 3, by2 + 1, 8 if not side else 7, C('#4a2f18'))
    img.set(cx if not side else cx + 1, by2, BUCK)
    img.set(cx if not side else cx + 1, by2 + 1, C('#9a7a20'))

    # ================================================= arms
    ay = ty + 2
    if side:
        ax = cx - 1 + int(round(phase * 2))
        img.rect(ax, ay, 3, 5, TU_D)              # sleeve
        img.vline(ax, ay, 5, TU_S)
        img.set(ax + 2, ay, TU_M)
        img.rect(ax, ay + 5, 3, 3, SK_M)          # forearm + hand
        img.vline(ax, ay + 5, 3, SK_D)
        img.set(ax + 1, ay + 7, SK_L)
    elif direction == 0:
        for sgn, off in ((-1, phase), (1, -phase)):
            axx = cx - 6 if sgn < 0 else cx + 4
            yy = ay + max(0, off)
            img.rect(axx, yy, 2, 4, TU_D)
            img.vline(axx if sgn < 0 else axx + 1, yy, 4, TU_S)
            img.rect(axx, yy + 4, 2, 3, SK_M)     # bare hand
            img.set(axx if sgn < 0 else axx + 1, yy + 4, SK_D)
            img.set(axx + (1 if sgn < 0 else 0), yy + 5, SK_L)
    else:
        for sgn, off in ((-1, phase), (1, -phase)):
            axx = cx - 6 if sgn < 0 else cx + 4
            yy = ay + max(0, off)
            img.rect(axx, yy, 2, 6, CL_M)
            img.vline(axx if sgn < 0 else axx + 1, yy, 6, CL_D)

    # ================================================= head
    hy = hd_top
    if side:
        # skull, narrower in profile
        img.rect(cx - 2, hy + 2, 5, 6, SK_M)
        img.rect(cx + 1, hy + 3, 2, 4, SK_L)      # lit cheek/brow
        img.vline(cx - 2, hy + 2, 6, SK_D)
        img.set(cx + 3, hy + 4, SK_M)             # nose
        img.set(cx + 3, hy + 5, SK_D)
        img.set(cx + 2, hy + 6, SK_D)             # lip line
        img.set(cx + 1, hy + 7, SK_D)             # jaw
        # hair: swept back with strand detail
        img.rect(cx - 3, hy, 7, 4, HR_M)
        img.rect(cx - 3, hy, 4, 4, HR_L)
        img.hline(cx - 3, hy, 7, HR_S)
        nape = 5 if hair != 1 else 8
        img.rect(cx - 3, hy + 3, 3, nape, HR_M)   # nape
        img.vline(cx - 3, hy + 3, nape, HR_D)
        img.set(cx - 3, hy + 2 + nape, HR_S)
        if hair == 2:
            img.rect(cx - 5, hy + 3, 2, 5, HR_M)  # ponytail behind
            img.set(cx - 5, hy + 7, HR_S)
        if hair == 0:
            img.set(cx - 3, hy + 8, HR_S)
        img.set(cx - 2, hy + 1, HR_L); img.set(cx, hy + 1, HR_D)
        img.set(cx + 2, hy + 2, HR_D)             # fringe tip
        # eye
        img.set(cx + 1, hy + 4, EYE)
        img.set(cx + 1, hy + 3, C('#ffffff', 55))
        img.hline(cx - 1, hy + 8, 4, SK_D)        # neck
        img.set(cx - 1, hy + 8, SK_S)
    else:
        img.rect(cx - 3, hy + 1, 7, 7, SK_M)
        img.rect(cx - 3, hy + 1, 2, 7, SK_D)      # left cheek shaded
        img.vline(cx - 3, hy + 1, 7, SK_S)
        img.rect(cx - 1, hy + 2, 3, 4, SK_L)      # lit centre of face
        img.set(cx + 3, hy + 6, SK_D)             # jaw corner
        img.set(cx - 3, hy + 6, SK_S)
        img.hline(cx - 2, hy + 8, 5, SK_D)        # neck
        img.hline(cx - 2, hy + 8, 2, SK_S)
        # ---- hair, three silhouettes
        img.rect(cx - 4, hy, 9, 3, HR_M)
        img.rect(cx - 4, hy, 4, 3, HR_L)
        img.hline(cx - 4, hy, 9, HR_S)
        if hair == 0:            # short crop, sideburns
            img.set(cx - 4, hy + 3, HR_M); img.set(cx + 4, hy + 3, HR_M)
            img.set(cx - 4, hy + 4, HR_D); img.set(cx + 4, hy + 4, HR_D)
            img.set(cx - 4, hy + 5, HR_S); img.set(cx + 4, hy + 5, HR_S)
        elif hair == 1:          # long hair framing the face
            img.rect(cx - 5, hy + 1, 2, 8, HR_M)
            img.rect(cx + 4, hy + 1, 2, 8, HR_D)
            img.vline(cx - 5, hy + 1, 8, HR_L)
            img.set(cx - 5, hy + 8, HR_S); img.set(cx + 5, hy + 8, HR_S)
            img.set(cx - 4, hy + 3, HR_M); img.set(cx + 4, hy + 3, HR_M)
        else:                    # hooded / tied back, tall top
            img.rect(cx - 4, hy - 1, 9, 2, HR_M)
            img.rect(cx - 4, hy - 1, 4, 2, HR_L)
            img.hline(cx - 4, hy - 1, 9, HR_S)
            img.set(cx - 4, hy + 3, HR_D); img.set(cx + 4, hy + 3, HR_D)
            img.rect(cx + 4, hy + 2, 2, 4, HR_M)   # short tail
            img.set(cx + 5, hy + 5, HR_S)
        if direction == 0:
            img.set(cx - 3, hy + 2, HR_D)         # fringe strands
            img.set(cx + 2, hy + 2, HR_D)
            img.set(cx - 1, hy + 2, HR_S)
            # eyes with brow + catch-light
            img.set(cx - 2, hy + 3, HR_S); img.set(cx + 1, hy + 3, HR_S)
            img.set(cx - 2, hy + 4, EYE); img.set(cx + 1, hy + 4, EYE)
            img.set(cx - 2, hy + 3, C('#ffffff', 40))
            # nose + mouth
            img.set(cx, hy + 5, SK_D)
            img.hline(cx - 1, hy + 6, 2, SK_S)
            # cheeks
            img.set(cx - 3, hy + 5, C('#d0806a', 110))
            img.set(cx + 2, hy + 5, C('#d0806a', 110))
        else:
            bh = 8 if hair != 1 else 11           # long hair falls further
            img.rect(cx - 4, hy, 9, bh, HR_M)     # back of head
            img.rect(cx - 4, hy, 4, bh, HR_L)
            img.hline(cx - 4, hy, 9, HR_S)
            img.hline(cx - 4, hy + bh - 1, 9, HR_S)
            if hair == 2:
                img.rect(cx - 1, hy + 7, 3, 5, HR_M)   # ponytail
                img.vline(cx - 1, hy + 7, 5, HR_L)
                img.hline(cx - 1, hy + 11, 3, HR_S)
            for sx in (cx - 3, cx, cx + 2):       # strand separations
                img.vline(sx, hy + 1, 5, HR_D)

    if direction == 1:
        img = img.flip()
    img.rim_light((255, 240, 206, 58), 'tl')
    img.outline_smart(tint=(24, 14, 22), strength=0.86, sat=0.40)
    return img


def player_sheet(hair=0):
    frames = {}
    for d in range(4):
        frames[('idle', d)] = [player_frame(d, 0, 'idle', hair)]
        frames[('walk', d)] = [player_frame(d, s, 'walk', hair) for s in range(4)]
    return frames


HAIR_STYLES = 3

def palette_map():
    """Exact ramp colours the runtime recolours for character customisation."""
    def hx(c):
        return '%02x%02x%02x' % (c[0], c[1], c[2])
    return {
        'skin':  [hx(SK_S), hx(SK_D), hx(SK_M), hx(SK_L)],
        'hair':  [hx(HR_S), hx(HR_D), hx(HR_M), hx(HR_L)],
        'cloak': [hx(CL_S), hx(CL_D), hx(CL_M), hx(CL_L)],
        'tunic': [hx(TU_S), hx(TU_D), hx(TU_M), hx(TU_L)],
        'pants': [hx(PA_S), hx(PA_D), hx(PA_M), hx(PA_L)],
    }


# ============================================================ creatures
def _crit_shadow(img, rx, cy):
    img.ellipse(img.w / 2, cy, rx, rx * .38, SHADOW)


def _rabbit(view, step):
    w, h = 20, 18
    img = Img(w, h)
    base, lt, dk = C('#a3937c'), C('#cdbfa6'), C('#6f6252')
    hop = [0, -2, -1, 0][step]
    _crit_shadow(img, 4.6 + (0 if hop == 0 else -.6), 16)
    cx, cy = 10, 11 + hop
    if view == 'side':
        img.ellipse(cx - 1, cy, 5.2, 3.8, base)            # body
        img.ellipse(cx - 2, cy - 1.2, 3.4, 2.2, lt)
        img.ellipse(cx + 1.5, cy + 1.6, 3.2, 2, dk)
        img.ellipse(cx - 2.6, cy + .6, 2.8, 2.4, dk)       # haunch mass
        img.ellipse(cx - 3.0, cy + .1, 1.9, 1.5, base)
        for fx, fy in [(cx - 4, cy - 1), (cx, cy - 2), (cx + 2, cy - 1)]:
            img.set(int(fx), int(fy), lt)                  # fur flecks
            img.set(int(fx) + 1, int(fy), base)
        img.ellipse(cx - 5.5, cy + .4, 2.2, 2.2, lt)       # cotton tail
        img.ellipse(cx + 4, cy - 2.6, 2.9, 2.7, base)      # head
        img.ellipse(cx + 4.6, cy - 3.2, 1.8, 1.5, lt)
        # ears sweep back when hopping
        er = -1 if hop else 0
        img.rect(cx + 2, cy - 8 + er, 2, 5, dk)            # far ear (shaded)
        img.rect(cx + 2, cy - 7 + er, 1, 3, C('#b98a8a'))
        img.rect(cx + 4, cy - 8, 2, 5, base)               # near ear
        img.vline(cx + 4, cy - 8, 5, lt)
        img.rect(cx + 5, cy - 7, 1, 3, C('#e2b3b3'))
        img.set(cx + 6, cy - 3, EYE)
        img.set(cx + 7, cy - 2, C('#e2b3b3'))              # nose
        # legs
        img.rect(cx + 1, cy + 3, 3, 2 + (1 if hop == 0 else 0), dk)
        img.rect(cx - 4, cy + 3, 4, 2 + (1 if hop == 0 else 0), base)
        img.rect(cx - 4, cy + 4, 4, 1, dk)
    else:
        front = view == 'front'
        img.ellipse(cx, cy + 1, 4.4, 4, base)
        img.ellipse(cx - 1.2, cy - .4, 2.8, 2.4, lt)
        img.ellipse(cx, cy - 3.4, 3.2, 2.8, base)
        img.ellipse(cx - 1, cy - 4, 1.9, 1.6, lt)
        img.rect(cx - 3, cy - 10, 2, 6, base); img.rect(cx + 1, cy - 10, 2, 6, base)
        if front:
            img.rect(cx - 3, cy - 9, 1, 4, C('#e2b3b3')); img.rect(cx + 2, cy - 9, 1, 4, C('#e2b3b3'))
            img.set(cx - 2, cy - 3, EYE); img.set(cx + 1, cy - 3, EYE)
            img.set(cx, cy - 1, C('#e2b3b3'))
        else:
            img.ellipse(cx, cy + 2, 2.2, 2, lt)            # tail from behind
        sw = [0, 1, 0, -1][step]
        img.rect(cx - 4, cy + 4 + max(0, sw), 3, 2, dk)
        img.rect(cx + 1, cy + 4 + max(0, -sw), 3, 2, dk)
    img.outline_smart(tint=(24, 16, 24), strength=0.82, sat=0.45)
    return img


def _deer(view, step):
    w, h = 24, 24
    img = Img(w, h)
    base, lt, dk = C('#a3714a'), C('#c99a6b'), C('#6f4a2c')
    _crit_shadow(img, 6.5, 22)
    cx, cy = 12, 13
    sw = [0, 1, 0, -1][step]
    if view == 'side':
        # legs first (behind body)
        for i, (lx, s) in enumerate([(cx - 5, sw), (cx + 3, -sw), (cx - 3, -sw), (cx + 5, sw)]):
            col = dk if i < 2 else base
            img.rect(lx + s, cy + 3, 2, 6 - abs(s), col)
            img.vline(lx + s, cy + 3, 6 - abs(s), mix(col, C('#000000'), .3))
            img.rect(lx + s, cy + 8 - abs(s), 2, 2, C('#2b1d12'))   # hoof
        img.ellipse(cx, cy, 7.5, 4.4, base)
        img.ellipse(cx - 1, cy - 1.6, 5.2, 2.6, lt)
        img.ellipse(cx + 2, cy + 2, 4.6, 2.2, dk)
        img.ellipse(cx - 4.4, cy + .2, 3.4, 3.2, dk)       # rear haunch
        img.ellipse(cx - 4.6, cy - .6, 2.4, 2.0, base)
        img.ellipse(cx - 5.0, cy - 1.2, 1.3, 1.0, lt)
        img.ellipse(cx + 4.2, cy - .8, 2.6, 2.2, base)     # shoulder
        img.set(int(cx + 4), int(cy - 2), lt)
        img.rect(cx + 5, cy - 6, 3, 6, base)               # neck
        img.rect(cx + 5, cy - 6, 1, 6, lt)
        img.ellipse(cx + 8, cy - 7, 3.2, 2.2, base)        # head
        img.ellipse(cx + 8.4, cy - 7.6, 2, 1.3, lt)
        img.set(cx + 10, cy - 7, EYE)
        img.set(cx + 11, cy - 6, C('#2b1d12'))
        img.line(cx + 6, cy - 10, cx + 4, cy - 14, C('#7a5a34'))   # antlers
        img.line(cx + 4, cy - 14, cx + 3, cy - 15, C('#8a6a3e'))
        img.line(cx + 5, cy - 12, cx + 3, cy - 12, C('#7a5a34'))
        img.line(cx + 8, cy - 10, cx + 8, cy - 14, C('#8a6a3e'))
        img.line(cx + 8, cy - 14, cx + 9, cy - 15, C('#9a7a4a'))
        img.line(cx + 8, cy - 12, cx + 10, cy - 12, C('#7a5a34'))
        img.ellipse(cx - 7, cy - 2, 1.8, 2.2, lt)          # tail
        for k in range(5):                                  # dappled spots
            sx2, sy2 = cx - 4 + k * 2, cy - 2 + (k % 2)
            img.set(sx2, sy2, C('#e0c49a'))
            if k % 2 == 0:
                img.set(sx2 + 1, sy2, C('#d4b58c'))
        img.hline(cx - 6, cy + 3, 9, dk)                    # belly line
    else:
        front = view == 'front'
        for i, sgn in enumerate([-1, 1]):
            s = sw * sgn
            img.rect(cx - 5 + (0 if sgn < 0 else 8), cy + 3, 2, 6 - abs(s), dk)
            img.rect(cx - 3 + (0 if sgn < 0 else 4), cy + 3, 2, 6 - abs(s), base)
        img.ellipse(cx, cy + 1, 5, 4.6, base)
        img.ellipse(cx - 1.4, cy - .6, 3.2, 3, lt)
        img.rect(cx - 2, cy - 7, 4, 6, base if front else dk)
        img.ellipse(cx, cy - 8, 3, 2.6, base)
        if front:
            img.ellipse(cx - 1, cy - 8.6, 1.8, 1.4, lt)
            img.set(cx - 2, cy - 8, EYE); img.set(cx + 1, cy - 8, EYE)
            img.set(cx, cy - 6, C('#2b1d12'))
            img.ellipse(cx - 4, cy - 8, 1.6, 1.2, base); img.ellipse(cx + 4, cy - 8, 1.6, 1.2, base)
        else:
            img.ellipse(cx, cy + 3, 1.8, 2, lt)
        img.line(cx - 2, cy - 10, cx - 4, cy - 14, C('#7a5a34'))
        img.line(cx + 2, cy - 10, cx + 4, cy - 14, C('#7a5a34'))
        img.line(cx - 4, cy - 14, cx - 5, cy - 15, C('#7a5a34'))
        img.line(cx + 4, cy - 14, cx + 5, cy - 15, C('#7a5a34'))
    img.outline_smart(tint=(24, 16, 24), strength=0.82, sat=0.45)
    return img


def _wolf(view, step):
    w, h = 24, 20
    img = Img(w, h)
    base, lt, dk = C('#6b6b78'), C('#8f8f9e'), C('#454550')
    _crit_shadow(img, 6.2, 18)
    cx, cy = 12, 11
    sw = [0, 1, 0, -1][step]
    if view == 'side':
        for i, (lx, s) in enumerate([(cx - 5, sw), (cx + 3, -sw), (cx - 3, -sw), (cx + 5, sw)]):
            col = dk if i < 2 else base
            img.rect(lx + s, cy + 3, 2, 4 - abs(s), col)
            img.vline(lx + s, cy + 3, 4 - abs(s), mix(col, C('#000000'), .32))
            img.rect(lx + s, cy + 6 - abs(s), 2, 2, C('#26262e'))   # paw
        img.ellipse(cx, cy, 7, 3.8, base)
        img.ellipse(cx - 1, cy - 1.4, 5, 2.2, lt)
        img.ellipse(cx + 2, cy + 1.6, 4.4, 2, dk)
        img.ellipse(cx + 3.6, cy - .6, 3.0, 2.8, base)     # shoulder ruff
        img.ellipse(cx + 3.4, cy - 1.4, 2.0, 1.5, lt)
        for k in range(5):                                  # soft nape crest
            img.set(int(cx - 1 + k), int(cy - 2.6), dk)
        img.ellipse(cx - 4, cy + .4, 2.8, 2.6, dk)         # rear haunch
        img.ellipse(cx - 4.2, cy - .2, 1.8, 1.6, base)
        img.ellipse(cx + 6.5, cy - 2.5, 3.4, 2.8, base)
        img.ellipse(cx + 6.5, cy - 3.2, 2.2, 1.6, lt)
        img.poly([(cx + 4, cy - 5), (cx + 5, cy - 8), (cx + 6.5, cy - 4.5)], dk)
        img.poly([(cx + 7, cy - 5), (cx + 8, cy - 8), (cx + 9, cy - 4.5)], base)
        img.ellipse(cx + 9.5, cy - 1.6, 2.2, 1.4, base)     # snout
        img.set(cx + 11, cy - 2, C('#1a1a20'))
        img.set(cx + 8, cy - 3, C('#e8c24a'))
        img.line(cx - 6, cy - 1, cx - 10, cy - 4 - (1 if sw > 0 else 0), lt)
        img.line(cx - 6, cy, cx - 10, cy - 3 - (1 if sw > 0 else 0), dk)
    else:
        front = view == 'front'
        for sgn in [-1, 1]:
            s = sw * sgn
            img.rect(cx - 5 + (0 if sgn < 0 else 8), cy + 3, 2, 4 - abs(s), dk)
            img.rect(cx - 3 + (0 if sgn < 0 else 4), cy + 3, 2, 4 - abs(s), base)
        img.ellipse(cx, cy + 1, 5.2, 4, base)
        img.ellipse(cx - 1.4, cy - .4, 3.4, 2.6, lt)
        img.ellipse(cx, cy - 4.6, 3.6, 3, base)
        img.poly([(cx - 4, cy - 6), (cx - 3, cy - 9), (cx - 1, cy - 6)], base)
        img.poly([(cx + 1, cy - 6), (cx + 3, cy - 9), (cx + 4, cy - 6)], base)
        if front:
            img.ellipse(cx, cy - 4, 2.2, 1.6, lt)
            img.set(cx - 2, cy - 5, C('#e8c24a')); img.set(cx + 1, cy - 5, C('#e8c24a'))
            img.ellipse(cx, cy - 2.6, 1.6, 1.1, dk)
            img.set(cx, cy - 3, C('#1a1a20'))
        else:
            img.ellipse(cx, cy + 5.5, 1.8, 3.2, base)
            img.ellipse(cx - .6, cy + 5, 1.1, 2.4, lt)
            img.ellipse(cx, cy + 8, 1.4, 1.2, C('#d8dae4'))
    img.outline_smart(tint=(24, 16, 24), strength=0.82, sat=0.45)
    return img


def _slime(view, step):
    w, h = 20, 18
    img = Img(w, h)
    sq = [0, .8, 1.4, .8][step]
    _crit_shadow(img, 5.6 + sq * .4, 16)
    cx, cy = 10, 12 - sq * .2
    body = C('#4fae6a', 235)
    img.ellipse(cx, cy - 1 + sq * .5, 6.4 + sq * .5, 5 - sq * .7, body)
    img.ellipse(cx - 1.8, cy - 3 + sq * .4, 3.6, 2.4, C('#79d18c', 220))
    img.ellipse(cx - 2.6, cy - 3.8 + sq * .4, 1.8, 1.1, C('#d6f7de', 235))
    img.ellipse(cx + 3, cy + .6, 2.8, 1.8, C('#2f7a48', 200))
    # dripping bottom edge
    for dx in (-4, 0, 4):
        img.ellipse(cx + dx, cy + 3.4 - sq * .6, 1.6, 1.1, body)
    if view != 'back':
        ex = 0 if view == 'front' else 2
        img.set(cx - 2 + ex, cy - 1, EYE); img.set(cx + 2 + ex, cy - 1, EYE)
        img.set(cx - 2 + ex, cy - 2, C('#ffffff', 150)); img.set(cx + 2 + ex, cy - 2, C('#ffffff', 150))
        img.hline(cx - 1 + ex, cy + 1, 3, C('#2b6b3f', 180))
    img.outline_smart(tint=(24, 16, 24), strength=0.82, sat=0.45)
    return img


def _bird(view, step):
    w, h = 18, 14
    img = Img(w, h)
    base, lt, dk = C('#6f83a0'), C('#a8b8d0'), C('#41506b')
    fly = [0, -1, -2, -1][step]
    img.ellipse(w / 2, 12, 3.4, 1.2, (14, 12, 20, 45))
    cx, cy = 9, 7 + fly
    wing_up = step in (1, 2)
    if view == 'side':
        img.ellipse(cx - 1, cy, 4.2, 2.8, base)
        img.ellipse(cx - 1.6, cy - .8, 2.8, 1.6, lt)
        img.ellipse(cx + 2.6, cy - 2, 2.4, 2.1, base)
        img.ellipse(cx + 2.8, cy - 2.6, 1.5, 1.1, lt)
        img.set(cx + 4, cy - 2, EYE)
        img.poly([(cx + 5, cy - 2), (cx + 7, cy - 1), (cx + 5, cy)], C('#e0a040'))
        if wing_up:
            img.poly([(cx - 1, cy - 1), (cx - 3, cy - 6), (cx + 2, cy - 3)], dk)
            img.poly([(cx - 1, cy - 1), (cx - 2, cy - 5), (cx + 1, cy - 3)], base)
        else:
            img.poly([(cx - 1, cy), (cx - 4, cy + 4), (cx + 2, cy + 1)], dk)
            img.poly([(cx - 1, cy), (cx - 3, cy + 3), (cx + 1, cy + 1)], base)
        img.poly([(cx - 5, cy), (cx - 8, cy - 1), (cx - 8, cy + 2), (cx - 5, cy + 1)], dk)
    else:
        img.ellipse(cx, cy, 3, 3.2, base)
        img.ellipse(cx - .8, cy - 1, 1.8, 1.8, lt)
        wy = cy - 3 if wing_up else cy + 1
        img.ellipse(cx - 5, wy, 3.6, 1.5, dk); img.ellipse(cx + 5, wy, 3.6, 1.5, dk)
        img.ellipse(cx - 4, wy, 2.2, 1.1, base); img.ellipse(cx + 4, wy, 2.2, 1.1, base)
        if view == 'front':
            img.set(cx - 1, cy - 1, EYE); img.set(cx + 1, cy - 1, EYE)
            img.poly([(cx - 1, cy + 1), (cx + 1, cy + 1), (cx, cy + 3)], C('#e0a040'))
        else:
            img.ellipse(cx, cy + 3, 1.6, 2.2, dk)
    img.outline_smart(tint=(24, 16, 24), strength=0.82, sat=0.45)
    return img


BUILDERS = {'rabbit': _rabbit, 'deer': _deer, 'wolf': _wolf, 'slime': _slime, 'bird': _bird}


def critter(kind, direction, step):
    """direction 0=S(front) 1=W 2=N(back) 3=E. West is East mirrored."""
    if kind == 'firefly':
        img = Img(8, 8)
        g = [140, 220, 255, 200][step]
        img.ellipse(4, 4, 2.8, 2.8, (255, 240, 160, g // 5))
        img.ellipse(4, 4, 1.5, 1.5, (255, 250, 200, g))
        img.set(4, 4, (255, 255, 255, 255))
        return img
    view = {0: 'front', 2: 'back'}.get(direction, 'side')
    img = BUILDERS[kind](view, step)
    if direction == 1:
        img = img.flip()
    return img


def critter_sheet(kind):
    out = {}
    for d in range(4):
        fr = [critter(kind, d, s) for s in range(4)]
        out[('walk', d)] = fr
        out[('idle', d)] = [fr[0]]
    return out
