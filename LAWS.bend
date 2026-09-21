import Base
import ./board.bend as Board

# CLAIM: for every nat x, x + 0 equals x.
law add_zero:
  for x: Nat
  {Nat.add(x, 0n) == x : Nat}

# CLAIM: Stamp.eq is reflexive for every stamp.
law stamp_eq_refl:
  for k: Board.Stamp
  {Board.Stamp.eq(k, k) == True{} : Bool}

# CLAIM: an empty element list has length zero.
law empty_elems_len:
  {List.length(&2, Board.Element, Board.Board.empty_elems()) == 0n : Nat}

# CLAIM: a live pointer-drag keeps local layout against any remote stamp.
law keep_local_during_move:
  for ox: U32
  for oy: U32
  for a: U32
  for b: U32
  {Board.Board.keep_local(Board.Moving{ox, oy}, a, b) == True{} : Bool}

# CLAIM: when still, a newer-or-equal local stamp wins last-write.
law keep_local_lww_still:
  {Board.Board.keep_local(Board.Still{}, 5, 3) == True{} : Bool}

# CLAIM: when still, an older local stamp yields to remote.
law keep_local_older_still:
  {Board.Board.keep_local(Board.Still{}, 3, 5) == False{} : Bool}
