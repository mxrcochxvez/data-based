import Base
import ./board.bend as Board
import ./catalog.bend as Cat
import ./ai.bend as Ai

def Keys.snoc(s: String, +c: Char) -> String:
  match s:
    case SNil{}:
      SCon{c, SNil{}}
    case SCon{h, t}:
      SCon{h, Keys.snoc(t, c)}

def Keys.init(s: String) -> String:
  match s:
    case SNil{}:
      SNil{}
    case SCon{h, t}:
      match t:
        case SNil{}:
          SNil{}
        case SCon{x, xs}:
          SCon{h, Keys.init(SCon{x, xs})}

def Shell.hit_only(hit: Maybe<U32>, b: Board.Board, shift: Bool) -> Board.Board:
  match hit:
    case None{}:
      Board.Board.apply(b, Board.ClearSel{})
    case Some{id}:
      Board.Board.apply(b, Board.Pick{id, shift})

def Shell.hit_pick(+x: U32, +y: U32, handle: Maybe<U32>, hit: Maybe<U32>, b: Board.Board, shift: Bool) -> Board.Board:
  match handle:
    case Some{id}:
      Board.Board.apply(b, Board.ResizeTo{id, 200, 120})
    case None{}:
      Shell.hit_only(hit, b, shift)

def Shell.click_canvas(+x: U32, +y: U32, s: Board.Board) -> Board.Board:
  match s:
    case Board.Board{next, +elems, sel, mode, drag, +shift}:
      Shell.hit_pick(
        x,
        y,
        Board.Elems.handle(elems, x, y),
        Board.Elems.hit(elems, x, y),
        Board.Board{next, elems, sel, mode, drag, shift},
        shift
      )

def Shell.place_kind(+k: Board.Stamp, b: Board.Board) -> Board.Board:
  Board.Board.apply(b, Board.Place{k, Cat.Layout.place_x(), Cat.Layout.place_y()})

def Shell.nav_at(hit: Bool, +x: U32, +y: U32, b: Board.Board) -> Board.Board:
  match hit:
    case True{}:
      Shell.place_kind(Cat.Catalog.pick_stamp(Cat.Catalog.nav_i(y)), b)
    case False{}:
      Shell.click_canvas(x, y, b)

def Shell.house_at(hit: Bool, +x: U32, +y: U32, b: Board.Board) -> Board.Board:
  match hit:
    case True{}:
      Board.Board.apply(b, Board.OpenMarket{})
    case False{}:
      Shell.nav_at(Cat.Catalog.in_nav(x, y), x, y, b)

def Shell.market_at(hit: Bool, +y: U32, +scroll: U32, b: Board.Board) -> Board.Board:
  match hit:
    case True{}:
      Shell.place_kind(Cat.Catalog.kind_at(scroll, y), b)
    case False{}:
      Board.Board.apply(b, Board.CloseOverlay{})

def Shell.click_mode(+x: U32, +y: U32, mode: Board.Mode, b: Board.Board) -> Board.Board:
  match mode:
    case Board.Market{scroll}:
      Shell.market_at(Cat.Catalog.in_panel(x, y), y, scroll, b)
    case Board.Canvas{}:
      Shell.house_at(Cat.Catalog.in_house(x, y), x, y, b)
    case Board.Edit{focus, buf}:
      Board.Board.apply(b, Board.CloseOverlay{})
    case Board.Chat{buf}:
      Board.Board.apply(b, Ai.Ai.parse(buf))

def Shell.click(+x: U32, +y: U32, s: Board.Board) -> Board.Board:
  match s:
    case Board.Board{next, elems, sel, +mode, drag, shift}:
      Shell.click_mode(x, y, mode, Board.Board{next, elems, sel, mode, drag, shift})

def Shell.mouse(+x: U32, +y: U32, +button: U32, down: Bool, b: Board.Board) -> Board.Board:
  match down:
    case False{}:
      b
    case True{}:
      Shell.click(x, y, b)

def Shell.type_mode(+code: U32, mode: Board.Mode, b: Board.Board) -> Board.Board:
  match mode:
    case Board.Edit{focus, buf}:
      Board.Board.apply(b, Board.SetBuf{Keys.snoc(buf, Char.from_u32(code))})
    case Board.Chat{buf}:
      Board.Board.apply(b, Board.SetBuf{Keys.snoc(buf, Char.from_u32(code))})
    case Board.Market{scroll}:
      b
    case Board.Canvas{}:
      b

def Shell.type_buf(+code: U32, s: Board.Board) -> Board.Board:
  match s:
    case Board.Board{next, elems, sel, +mode, drag, shift}:
      Shell.type_mode(code, mode, Board.Board{next, elems, sel, mode, drag, shift})

def Shell.back_mode(mode: Board.Mode, b: Board.Board) -> Board.Board:
  match mode:
    case Board.Edit{focus, buf}:
      Board.Board.apply(b, Board.SetBuf{Keys.init(buf)})
    case Board.Chat{buf}:
      Board.Board.apply(b, Board.SetBuf{Keys.init(buf)})
    case Board.Market{scroll}:
      b
    case Board.Canvas{}:
      b

def Shell.back(s: Board.Board) -> Board.Board:
  match s:
    case Board.Board{next, elems, sel, +mode, drag, shift}:
      Shell.back_mode(mode, Board.Board{next, elems, sel, mode, drag, shift})

def Shell.key_code(+code: U32, b: Board.Board) -> Board.Board:
  match code:
    case 27:
      Board.Board.apply(b, Board.CloseOverlay{})
    case 13:
      Board.Board.apply(b, Board.CommitEdit{})
    case 8:
      Shell.back(b)
    case 104:
      Board.Board.apply(b, Board.OpenMarket{})
    case 101:
      Board.Board.apply(b, Board.OpenEdit{})
    case 114:
      Board.Board.apply(b, Board.ToggleRaw{})
    case 47:
      Board.Board.apply(b, Board.OpenChat{})
    case _:
      Shell.type_buf(code, b)

def Shell.key(+code: U32, down: Bool, b: Board.Board) -> Board.Board:
  match down:
    case False{}:
      b
    case True{}:
      Shell.key_code(code, b)

def Shell.one(e: Event, b: Board.Board) -> Maybe<Board.Board>:
  match e:
    case Close{}:
      None{}
    case Key{code, down}:
      Some{Shell.key(code, down, b)}
    case Mouse{x, y, button, down}:
      Some{Shell.mouse(x, y, button, down, b)}
    case Move{x, y}:
      Some{b}

def Shell.step(e: Event, acc: Maybe<Board.Board>) -> Maybe<Board.Board>:
  match acc:
    case None{}:
      None{}
    case Some{b}:
      Shell.one(e, b)

def Shell.fold(events: List<Event>, acc: Maybe<Board.Board>) -> Maybe<Board.Board>:
  match events:
    case Nil{}:
      acc
    case h <> t:
      Shell.fold(t, Shell.step(h, acc))

def Shell.tick(events: List<Event>, s: Board.Board) -> IO(Maybe<Board.Board>):
  IO.pure(Maybe<Board.Board>, Shell.fold(events, Some{s}))
