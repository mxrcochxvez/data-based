import Base
import ./board.bend as Board
import ./catalog.bend as Cat

def Tone.paper() -> U32:
  16250095

def Tone.line() -> U32:
  14078408

def Tone.rail() -> U32:
  1841430

def Tone.rail_edge() -> U32:
  2762274

def Tone.strip() -> U32:
  15723492

def Tone.hair() -> U32:
  13222840

def Tone.ink() -> U32:
  4012083

def Tone.panel() -> U32:
  16776439

def Tone.row() -> U32:
  15986664

def Tone.white() -> U32:
  16777215

def View.field(+cx: U32, +cy: U32) -> U32:
  Bool.pick(
    U32,
    Bool.or(U32.is_eq(U32.mod(cx, 32), 0), U32.is_eq(U32.mod(cy, 32), 0)),
    Tone.line(),
    Tone.paper()
  )

def View.house_ink(+cx: U32, +cy: U32) -> Bool:
  Bool.or(
    Cat.Hit.box(cx, cy, 100, 14, 8, 4),
    Bool.or(
      Cat.Hit.box(cx, cy, 92, 18, 24, 4),
      Bool.or(
        Cat.Hit.box(cx, cy, 96, 22, 16, 20),
        Cat.Hit.box(cx, cy, 100, 30, 8, 12)
      )
    )
  )

def View.house_edge(+cx: U32, +cy: U32) -> Bool:
  Bool.or(
    Bool.or(U32.is_lt(cx, 88), U32.is_ge(cx, 120)),
    Bool.or(U32.is_lt(cy, 14), U32.is_ge(cy, 46))
  )

def View.house_btn(+cx: U32, +cy: U32) -> U32:
  Bool.pick(
    U32,
    View.house_ink(cx, cy),
    Tone.ink(),
    Bool.pick(U32, View.house_edge(cx, cy), Tone.ink(), Tone.paper())
  )

def View.rail_px(+cx: U32, +cy: U32) -> U32:
  Bool.pick(
    U32,
    U32.is_ge(cx, 68),
    Tone.rail_edge(),
    Bool.pick(
      U32,
      Cat.Catalog.in_nav(cx, cy),
      Board.Stamp.color(Cat.Catalog.pick_stamp(Cat.Catalog.nav_i(cy))),
      Tone.rail()
    )
  )

def View.strip_px(+cx: U32, +cy: U32) -> U32:
  Bool.pick(
    U32,
    Cat.Catalog.in_house(cx, cy),
    View.house_btn(cx, cy),
    Bool.pick(U32, U32.is_ge(cy, 48), Tone.hair(), Tone.strip())
  )

def View.with_elem(got: Maybe<U32>, +cx: U32, +cy: U32) -> U32:
  match got:
    case Some{col}:
      col
    case None{}:
      View.field(cx, cy)

def View.work(+cx: U32, +cy: U32, elems: +List<Board.Element>) -> U32:
  View.with_elem(Board.Elems.color(elems, cx, cy, 4), cx, cy)

def View.shell(+cx: U32, +cy: U32, elems: +List<Board.Element>) -> U32:
  Bool.pick(
    U32,
    U32.is_lt(cx, Cat.Layout.rail_w()),
    View.rail_px(cx, cy),
    Bool.pick(
      U32,
      U32.is_lt(cy, Cat.Layout.strip_h()),
      View.strip_px(cx, cy),
      View.work(cx, cy, elems)
    )
  )

def View.panel_frame(+cx: U32, +cy: U32) -> Bool:
  Bool.or(
    Bool.or(U32.is_lt(cx, 100), U32.is_ge(cx, 612)),
    Bool.or(U32.is_lt(cy, 72), U32.is_ge(cy, 976))
  )

def View.panel_row(+cx: U32, +cy: U32, +scroll: U32) -> U32:
  Bool.pick(
    U32,
    Cat.Catalog.is_heading(scroll, cy),
    Board.Stamp.color(Cat.Catalog.kind_at(scroll, cy)),
    Bool.pick(
      U32,
      Bool.and(Cat.Hit.box(cx, cy, 120, 104, 40, 868), Cat.Catalog.is_swatch(scroll, cy)),
      Board.Stamp.color(Cat.Catalog.kind_at(scroll, cy)),
      Tone.panel()
    )
  )

def View.panel(+cx: U32, +cy: U32, +scroll: U32) -> U32:
  Bool.pick(
    U32,
    View.panel_frame(cx, cy),
    Tone.ink(),
    Bool.pick(
      U32,
      U32.is_lt(cy, Cat.Layout.list_top()),
      Tone.rail(),
      View.panel_row(cx, cy, scroll)
    )
  )

def View.market(+cx: U32, +cy: U32, +scroll: U32, elems: +List<Board.Element>) -> U32:
  Bool.pick(
    U32,
    Cat.Catalog.in_panel(cx, cy),
    View.panel(cx, cy, scroll),
    View.shell(cx, cy, elems)
  )

def View.in_dialog(+cx: U32, +cy: U32) -> Bool:
  Cat.Hit.box(cx, cy, 220, 220, 600, 500)

def View.dialog_frame(+cx: U32, +cy: U32) -> Bool:
  Bool.or(
    Bool.or(U32.is_lt(cx, 224), U32.is_ge(cx, 816)),
    Bool.or(U32.is_lt(cy, 224), U32.is_ge(cy, 716))
  )

def View.edit_px(+cx: U32, +cy: U32, elems: +List<Board.Element>) -> U32:
  Bool.pick(
    U32,
    View.in_dialog(cx, cy),
    Bool.pick(U32, View.dialog_frame(cx, cy), Tone.ink(), Tone.white()),
    View.shell(cx, cy, elems)
  )

def View.chat_px(+cx: U32, +cy: U32, elems: +List<Board.Element>) -> U32:
  Bool.pick(
    U32,
    Bool.and(U32.is_ge(cy, 880), U32.is_ge(cx, Cat.Layout.rail_w())),
    Bool.pick(U32, U32.is_lt(cy, 884), Tone.hair(), Tone.white()),
    View.shell(cx, cy, elems)
  )

def View.layer(+cx: U32, +cy: U32, elems: +List<Board.Element>, mode: Board.Mode) -> U32:
  match mode:
    case Board.Market{scroll}:
      View.market(cx, cy, scroll, elems)
    case Board.Edit{focus, buf}:
      View.edit_px(cx, cy, elems)
    case Board.Chat{buf}:
      View.chat_px(cx, cy, elems)
    case Board.Canvas{}:
      View.shell(cx, cy, elems)

def View.paint(+cx: U32, +cy: U32, s: Board.Board) -> U32:
  match s:
    case Board.Board{next, elems, sel, mode, drag, shift}:
      View.layer(cx, cy, elems, mode)

def View.tile(+k: Nat, +x: U32, +y: U32, +s: Board.Board) -> Image:
  match k:
    case 0n:
      Pix{View.paint(x, y, s)}
    case 1n+p:
      +h = U32.shln(4, p)
      a b c d =
        View.tile(p, x, y, s)
        View.tile(p, (x + h : U32), y, s)
        View.tile(p, x, (y + h : U32), s)
        View.tile(p, (x + h : U32), (y + h : U32), s)
      Qua{a, b, c, d}

def Shell.view(s: Board.Board) -> Pair(Board.Board, Image):
  +b = s
  Tuple{b, View.tile!(8n, 0, 0, b)}
