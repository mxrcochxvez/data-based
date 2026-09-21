import Base

# Domain. One board, one command type, one apply. UI, chat, and collab
# all emit Cmd. Overlay is a mode on the board, not a second tree.

type Stamp is Data:
  SMind{}
  SSchema{}
  SLogic{}
  SRepo{}
  SCtrl{}
  SGql{}
  SDriz{}
  SPrisma{}

type Field is Data:
  Field{name: String, typ: String}

type Body is Data:
  BMind{title: String, notes: String}
  BSchema{table: String, fields: +List<Field>, sql: String, raw: Bool}
  BLogic{name: String, notes: String}
  BRepo{path: String, notes: String}
  BCtrl{name: String, notes: String}
  BGql{name: String, sdl: String, raw: Bool}
  BDriz{table: String, fields: +List<Field>, src: String, raw: Bool}
  BPrisma{model: String, fields: +List<Field>, src: String, raw: Bool}

type Rect is Data:
  Rect{x: U32, y: U32, w: U32, h: U32}

type Element is Data:
  Elem{id: U32, kind: Stamp, rect: Rect, body: Body}

type Mode is Data:
  Canvas{}
  Market{scroll: U32}
  Edit{focus: U32, buf: String}
  Chat{buf: String}

type Drag is Data:
  Still{}
  Moving{ox: U32, oy: U32}
  Sizing{id: U32}

# Pointer-drag and a newer local stamp both keep the local board.
# A remote hydrate with an older updatedAt must not rewind x/y.
def Drag.holds(+d: Drag) -> Bool:
  match d:
    case Still{}:
      False{}
    case Moving{ox, oy}:
      True{}
    case Sizing{id}:
      True{}

def Board.keep_local(+d: Drag, +local_at: U32, +remote_at: U32) -> Bool:
  match d:
    case Still{}:
      U32.is_ge(local_at, remote_at)
    case Moving{ox, oy}:
      True{}
    case Sizing{id}:
      True{}

type Cmd is Data:
  Noop{}
  Place{kind: Stamp, x: U32, y: U32}
  Pick{id: U32, add: Bool}
  ClearSel{}
  DragBy{left: Bool, dx: U32, up: Bool, dy: U32}
  ResizeTo{id: U32, w: U32, h: U32}
  OpenMarket{}
  CloseOverlay{}
  MarketScroll{up: Bool, dy: U32}
  OpenEdit{}
  ToggleRaw{}
  SetBuf{buf: String}
  CommitEdit{}
  OpenChat{}
  SetShift{on: Bool}

type Board is Data:
  Board{
    next: U32
    elems: +List<Element>
    sel: +List<U32>
    mode: Mode
    drag: Drag
    shift: Bool
  }

def Stamp.eq(+a: Stamp, +b: Stamp) -> Bool:
  match a b:
    case SMind{} SMind{}:
      True{}
    case SSchema{} SSchema{}:
      True{}
    case SLogic{} SLogic{}:
      True{}
    case SRepo{} SRepo{}:
      True{}
    case SCtrl{} SCtrl{}:
      True{}
    case SGql{} SGql{}:
      True{}
    case SDriz{} SDriz{}:
      True{}
    case SPrisma{} SPrisma{}:
      True{}
    case _ _:
      False{}

def Stamp.color(+k: Stamp) -> U32:
  match k:
    case SMind{}:
      9684477
    case SSchema{}:
      8843180
    case SLogic{}:
      16628340
    case SRepo{}:
      12891645
    case SCtrl{}:
      16361684
    case SGql{}:
      6809849
    case SDriz{}:
      16638023
    case SPrisma{}:
      16622767

def Stamp.label(+k: Stamp) -> String:
  match k:
    case SMind{}:
      "mind-map"
    case SSchema{}:
      "db-schema"
    case SLogic{}:
      "biz-logic"
    case SRepo{}:
      "repository"
    case SCtrl{}:
      "controller"
    case SGql{}:
      "graphql"
    case SDriz{}:
      "drizzle"
    case SPrisma{}:
      "prisma"

def Body.blank(+k: Stamp) -> Body:
  match k:
    case SMind{}:
      BMind{"card", ""}
    case SSchema{}:
      BSchema{"table", Nil{}, "", False{}}
    case SLogic{}:
      BLogic{"effect", ""}
    case SRepo{}:
      BRepo{"repo", ""}
    case SCtrl{}:
      BCtrl{"controller", ""}
    case SGql{}:
      BGql{"Query", "", False{}}
    case SDriz{}:
      BDriz{"table", Nil{}, "", False{}}
    case SPrisma{}:
      BPrisma{"Model", Nil{}, "", False{}}

def Body.toggle_raw(body: Body) -> Body:
  match body:
    case BSchema{table, fields, sql, raw}:
      BSchema{table, fields, sql, Bool.not(raw)}
    case BGql{name, sdl, raw}:
      BGql{name, sdl, Bool.not(raw)}
    case BDriz{table, fields, src, raw}:
      BDriz{table, fields, src, Bool.not(raw)}
    case BPrisma{model, fields, src, raw}:
      BPrisma{model, fields, src, Bool.not(raw)}
    case other:
      other

def Body.set_buf(body: Body, +buf: String) -> Body:
  match body:
    case BMind{title, notes}:
      BMind{buf, notes}
    case BSchema{table, fields, sql, raw}:
      match raw:
        case True{}:
          BSchema{table, fields, buf, raw}
        case False{}:
          BSchema{buf, fields, sql, raw}
    case BLogic{name, notes}:
      BLogic{buf, notes}
    case BRepo{path, notes}:
      BRepo{buf, notes}
    case BCtrl{name, notes}:
      BCtrl{buf, notes}
    case BGql{name, sdl, raw}:
      match raw:
        case True{}:
          BGql{name, buf, raw}
        case False{}:
          BGql{buf, sdl, raw}
    case BDriz{table, fields, src, raw}:
      match raw:
        case True{}:
          BDriz{table, fields, buf, raw}
        case False{}:
          BDriz{buf, fields, src, raw}
    case BPrisma{model, fields, src, raw}:
      match raw:
        case True{}:
          BPrisma{model, fields, buf, raw}
        case False{}:
          BPrisma{buf, fields, src, raw}

def Rect.contains(+r: Rect, +px: U32, +py: U32) -> Bool:
  Rect{x, y, w, h} = r
  Bool.and(
    Bool.and(U32.is_ge(px, x), U32.is_lt(px, (x + w : U32))),
    Bool.and(U32.is_ge(py, y), U32.is_lt(py, (y + h : U32)))
  )

def Rect.overlaps_cell(+r: Rect, +cx: U32, +cy: U32, +s: U32) -> Bool:
  Rect{x, y, w, h} = r
  Bool.and(
    Bool.and(U32.is_lt(x, (cx + s : U32)), U32.is_lt(cx, (x + w : U32))),
    Bool.and(U32.is_lt(y, (cy + s : U32)), U32.is_lt(cy, (y + h : U32)))
  )

def Rect.handle(+r: Rect, +px: U32, +py: U32) -> Bool:
  Rect{x, y, w, h} = r
  Rect.contains(Rect{(x + w - 10 : U32), (y + h - 10 : U32), 10, 10}, px, py)

def U32.clamp_min(+n: U32, +lo: U32) -> U32:
  Bool.pick(U32, U32.is_lt(n, lo), lo, n)

def U32.clamp_max(+n: U32, +hi: U32) -> U32:
  Bool.pick(U32, U32.is_gt(n, hi), hi, n)

def U32.move(+n: U32, neg: Bool, +d: U32, +hi: U32) -> U32:
  match neg:
    case True{}:
      Bool.pick(U32, U32.is_lt(n, d), 0, (n - d : U32))
    case False{}:
      U32.clamp_max((n + d : U32), hi)

def Board.start() -> Board:
  Board{1, Nil{}, Nil{}, Canvas{}, Still{}, False{}}

def Board.empty_elems() -> +List<Element>:
  Nil{}

def Ids.has(ids: +List<U32>, +id: U32) -> Bool:
  match ids:
    case Nil{}:
      False{}
    case h <> t:
      Bool.or(U32.is_eq(h, id), Ids.has(t, id))

def Ids.toggle(ids: +List<U32>, +id: U32) -> +List<U32>:
  id <> ids

def Elems.hit(xs: +List<Element>, +px: U32, +py: U32) -> Maybe<U32>:
  match xs:
    case Nil{}:
      None{}
    case h <> t:
      Elem{+id, kind, rect, body} = h
      Bool.pick(Maybe<U32>, Rect.contains(rect, px, py), Some{id}, Elems.hit(t, px, py))

def Elems.handle(xs: +List<Element>, +px: U32, +py: U32) -> Maybe<U32>:
  match xs:
    case Nil{}:
      None{}
    case h <> t:
      Elem{+id, kind, rect, body} = h
      Bool.pick(Maybe<U32>, Rect.handle(rect, px, py), Some{id}, Elems.handle(t, px, py))

def Elems.get(xs: +List<Element>, +id: U32) -> Maybe<Element>:
  match xs:
    case Nil{}:
      None{}
    case h <> t:
      Elem{+eid, +kind, +rect, +body} = h
      Bool.pick(
        Maybe<Element>,
        U32.is_eq(eid, id),
        Some{Elem{eid, kind, rect, body}},
        Elems.get(t, id)
      )

def Elems.color(xs: +List<Element>, +cx: U32, +cy: U32, +s: U32) -> Maybe<U32>:
  match xs:
    case Nil{}:
      None{}
    case h <> t:
      Elem{id, +kind, +rect, body} = h
      over = Rect.overlaps_cell(rect, cx, cy, s)
      corner = Rect.handle(rect, (cx + (s - 1 : U32) : U32), (cy + (s - 1 : U32) : U32))
      here = Bool.pick(U32, corner, 1120295, Stamp.color(kind))
      Bool.pick(Maybe<U32>, over, Some{here}, Elems.color(t, cx, cy, s))

def Elems.move(xs: +List<Element>, +sel: +List<U32>, +left: Bool, +dx: U32, +up: Bool, +dy: U32) -> +List<Element>:
  match xs:
    case Nil{}:
      Nil{}
    case h <> t:
      Elem{+id, +kind, +rect, +body} = h
      Rect{+x, +y, +w, +hgt} = rect
      on = Ids.has(sel, id)
      moved = {Elem{
        id,
        kind,
        Rect{U32.move(x, left, dx, 1000), U32.move(y, up, dy, 1000), w, hgt},
        body
      } : Element}
      rest = Elems.move(t, sel, left, dx, up, dy)
      Bool.pick(Element, on, moved, Elem{id, kind, Rect{x, y, w, hgt}, body}) <> rest

def Elems.resize(xs: +List<Element>, +id: U32, +nw: U32, +nh: U32) -> +List<Element>:
  match xs:
    case Nil{}:
      Nil{}
    case h <> t:
      Elem{+eid, +kind, +rect, +body} = h
      Rect{+x, +y, +w, +hgt} = rect
      eq = U32.is_eq(eid, id)
      done = {Elem{eid, kind, Rect{x, y, U32.clamp_min(nw, 48), U32.clamp_min(nh, 32)}, body} : Element}
      keep = {Elem{eid, kind, Rect{x, y, w, hgt}, body} : Element}
      Bool.pick(Element, eq, done, keep) <> Elems.resize(t, id, nw, nh)

def Elems.set_body(xs: +List<Element>, +id: U32, +body: Body) -> +List<Element>:
  match xs:
    case Nil{}:
      Nil{}
    case h <> t:
      Elem{+eid, +kind, +rect, +old} = h
      eq = U32.is_eq(eid, id)
      rest = Elems.set_body(t, id, body)
      Bool.pick(Element, eq, Elem{eid, kind, rect, body}, Elem{eid, kind, rect, old}) <> rest

def Elems.body_of(el: Maybe<Element>) -> Maybe<Body>:
  match el:
    case None{}:
      None{}
    case Some{e}:
      Elem{eid, kind, rect, body} = e
      Some{body}

def Elems.body(xs: +List<Element>, +id: U32) -> Maybe<Body>:
  Elems.body_of(Elems.get(xs, id))

def Sel.first(+sel: +List<U32>) -> Maybe<U32>:
  match sel:
    case Nil{}:
      None{}
    case h <> t:
      Some{h}

def Board.open_edit_at(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  first: Maybe<U32>
) -> Board:
  match first:
    case None{}:
      Board{next, elems, sel, mode, drag, shift}
    case Some{id}:
      Board{next, elems, sel, Edit{0, ""}, Still{}, shift}

def Board.toggle_body(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  +id: U32, got: Maybe<Body>
) -> Board:
  match got:
    case None{}:
      Board{next, elems, sel, mode, drag, shift}
    case Some{body}:
      Board{next, Elems.set_body(elems, id, Body.toggle_raw(body)), sel, mode, drag, shift}

def Board.toggle_at(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  first: Maybe<U32>
) -> Board:
  match first:
    case None{}:
      Board{next, elems, sel, mode, drag, shift}
    case Some{+id}:
      Board.toggle_body(next, elems, sel, mode, drag, shift, id, Elems.body(elems, id))

def Board.commit_body(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, shift: Bool,
  +id: U32, +buf: String, got: Maybe<Body>
) -> Board:
  match got:
    case None{}:
      Board{next, elems, sel, Canvas{}, Still{}, shift}
    case Some{body}:
      Board{next, Elems.set_body(elems, id, Body.set_buf(body, buf)), sel, Canvas{}, Still{}, shift}

def Board.commit_at(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, shift: Bool,
  +buf: String, first: Maybe<U32>
) -> Board:
  match first:
    case None{}:
      Board{next, elems, sel, Canvas{}, Still{}, shift}
    case Some{+id}:
      Board.commit_body(next, elems, sel, shift, id, buf, Elems.body(elems, id))

def Board.pick(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  +id: U32, add: Bool
) -> Board:
  match add:
    case True{}:
      Board{next, elems, Ids.toggle(sel, id), mode, drag, shift}
    case False{}:
      Board{next, elems, id <> Nil{}, mode, drag, shift}

def Board.scroll(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  up: Bool, +dy: U32
) -> Board:
  match mode:
    case Market{scroll}:
      Board{next, elems, sel, Market{U32.move(scroll, up, dy, 800)}, drag, shift}
    case other:
      Board{next, elems, sel, other, drag, shift}

def Board.set_buf(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool,
  buf: String
) -> Board:
  match mode:
    case Edit{focus, old}:
      Board{next, elems, sel, Edit{focus, buf}, drag, shift}
    case Chat{old}:
      Board{next, elems, sel, Chat{buf}, drag, shift}
    case other:
      Board{next, elems, sel, other, drag, shift}

def Board.commit(
  next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool
) -> Board:
  match mode:
    case Edit{focus, buf}:
      Board.commit_at(next, elems, sel, shift, buf, Sel.first(sel))
    case other:
      Board{next, elems, sel, other, drag, shift}

def Board.act(
  cmd: Cmd, +next: U32, +elems: +List<Element>, +sel: +List<U32>, mode: Mode, drag: Drag, shift: Bool
) -> Board:
  match cmd:
    case Noop{}:
      Board{next, elems, sel, mode, drag, shift}
    case Place{+kind, x, y}:
      el = {Elem{next, kind, Rect{x, y, 160, 96}, Body.blank(kind)} : Element}
      Board{(next + 1 : U32), el <> elems, next <> Nil{}, Canvas{}, Still{}, shift}
    case Pick{id, add}:
      Board.pick(next, elems, sel, mode, drag, shift, id, add)
    case ClearSel{}:
      Board{next, elems, Nil{}, mode, Still{}, shift}
    case DragBy{left, dx, up, dy}:
      Board{next, Elems.move(elems, sel, left, dx, up, dy), sel, mode, drag, shift}
    case ResizeTo{id, w, h}:
      Board{next, Elems.resize(elems, id, w, h), sel, mode, drag, shift}
    case OpenMarket{}:
      Board{next, elems, sel, Market{0}, Still{}, shift}
    case CloseOverlay{}:
      Board{next, elems, sel, Canvas{}, Still{}, shift}
    case MarketScroll{up, dy}:
      Board.scroll(next, elems, sel, mode, drag, shift, up, dy)
    case OpenEdit{}:
      Board.open_edit_at(next, elems, sel, mode, drag, shift, Sel.first(sel))
    case ToggleRaw{}:
      Board.toggle_at(next, elems, sel, mode, drag, shift, Sel.first(sel))
    case SetBuf{buf}:
      Board.set_buf(next, elems, sel, mode, drag, shift, buf)
    case CommitEdit{}:
      Board.commit(next, elems, sel, mode, drag, shift)
    case OpenChat{}:
      Board{next, elems, sel, Chat{""}, Still{}, shift}
    case SetShift{on}:
      Board{next, elems, sel, mode, drag, on}

def Board.unbox(b: Board, cmd: Cmd) -> Board:
  match b:
    case Board{next, elems, sel, mode, drag, shift}:
      Board.act(cmd, next, elems, sel, mode, drag, shift)

def Board.apply(b: Board, cmd: Cmd) -> Board:
  Board.unbox(b, cmd)

def Board.place_on_empty(+kind: Stamp, +x: U32, +y: U32) -> Board:
  Board.apply(Board.start(), Place{kind, x, y})
