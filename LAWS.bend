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
