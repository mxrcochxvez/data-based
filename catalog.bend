import Base
import ./board.bend as Board

type Offer is Data:
  Offer{kind: Board.Stamp, title: String}

def Layout.rail_w() -> U32:
  72

def Layout.strip_h() -> U32:
  52

def Layout.house_x() -> U32:
  84

def Layout.house_y() -> U32:
  10

def Layout.house_s() -> U32:
  40

def Layout.panel_x() -> U32:
  96

def Layout.panel_w() -> U32:
  520

def Layout.list_top() -> U32:
  104

def Layout.row_h() -> U32:
  72

def Layout.nav_top() -> U32:
  64

def Layout.nav_step() -> U32:
  52

def Layout.nav_pad() -> U32:
  16

def Layout.place_x() -> U32:
  220

def Layout.place_y() -> U32:
  160

def Hit.box(+px: U32, +py: U32, +x: U32, +y: U32, +w: U32, +h: U32) -> Bool:
  Bool.and(
    Bool.and(U32.is_ge(px, x), U32.is_lt(px, (x + w : U32))),
    Bool.and(U32.is_ge(py, y), U32.is_lt(py, (y + h : U32)))
  )

def Catalog.local.at(early: Bool, +scroll: U32, +y: U32) -> U32:
  match early:
    case True{}:
      0
    case False{}:
      (scroll + (y - Layout.list_top() : U32) : U32)

def Catalog.local(+scroll: U32, +y: U32) -> U32:
  Catalog.local.at(U32.is_lt(y, Layout.list_top()), scroll, y)

def Catalog.row(+scroll: U32, +y: U32) -> U32:
  U32.div(Catalog.local(scroll, y), Layout.row_h())

def Catalog.within(+scroll: U32, +y: U32) -> U32:
  U32.mod(Catalog.local(scroll, y), Layout.row_h())

def Catalog.row_mod(+scroll: U32, +y: U32) -> U32:
  U32.mod(Catalog.row(scroll, y), 8)

def Catalog.pick_stamp(+n: U32) -> Board.Stamp:
  match n:
    case 0:
      Board.SMind{}
    case 1:
      Board.SSchema{}
    case 2:
      Board.SLogic{}
    case 3:
      Board.SRepo{}
    case 4:
      Board.SCtrl{}
    case 5:
      Board.SGql{}
    case 6:
      Board.SDriz{}
    case 7:
      Board.SPrisma{}
    case _:
      Board.SMind{}

def Catalog.kind_at(+scroll: U32, +y: U32) -> Board.Stamp:
  Catalog.pick_stamp(Catalog.row_mod(scroll, y))

def Catalog.title(+k: Board.Stamp) -> String:
  Board.Stamp.label(k)

def Catalog.row_y(+i: U32) -> U32:
  (Layout.list_top() + (i * Layout.row_h() : U32) : U32)

def Catalog.is_heading(+scroll: U32, +y: U32) -> Bool:
  Bool.and(U32.is_ge(y, Layout.list_top()), U32.is_lt(Catalog.within(scroll, y), 8))

def Catalog.is_swatch(+scroll: U32, +y: U32) -> Bool:
  Bool.and(
    U32.is_ge(y, Layout.list_top()),
    Bool.and(
      U32.is_ge(Catalog.within(scroll, y), 16),
      U32.is_lt(Catalog.within(scroll, y), 56)
    )
  )

def Catalog.pick_vendor(+n: U32) -> String:
  match n:
    case 0:
      "data-based"
    case 1:
      "acme"
    case 2:
      "northstar"
    case _:
      "data-based"

def Catalog.vendor_at(+scroll: U32, +y: U32) -> String:
  Catalog.pick_vendor(U32.mod(Catalog.row(scroll, y), 3))

def Catalog.nav_i.at(early: Bool, +y: U32) -> U32:
  match early:
    case True{}:
      8
    case False{}:
      U32.div((y - Layout.nav_top() : U32), Layout.nav_step())

def Catalog.nav_i(+y: U32) -> U32:
  Catalog.nav_i.at(U32.is_lt(y, Layout.nav_top()), y)

def Catalog.in_nav.go(+x: U32, +y: U32) -> Bool:
  Bool.and(
    U32.is_lt(Catalog.nav_i(y), 8),
    Bool.and(
      Hit.box(x, y, Layout.nav_pad(), Layout.nav_top(), 40, 416),
      U32.is_lt(U32.mod((y - Layout.nav_top() : U32), Layout.nav_step()), 40)
    )
  )

def Catalog.in_nav.at(ready: Bool, +x: U32, +y: U32) -> Bool:
  match ready:
    case False{}:
      False{}
    case True{}:
      Catalog.in_nav.go(x, y)

def Catalog.in_nav(+x: U32, +y: U32) -> Bool:
  Catalog.in_nav.at(U32.is_ge(y, Layout.nav_top()), x, y)

def Catalog.in_house(+x: U32, +y: U32) -> Bool:
  Hit.box(x, y, Layout.house_x(), Layout.house_y(), Layout.house_s(), Layout.house_s())

def Catalog.in_panel(+x: U32, +y: U32) -> Bool:
  Hit.box(x, y, Layout.panel_x(), 68, Layout.panel_w(), 912)
