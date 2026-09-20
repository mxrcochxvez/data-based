import Base
import ./LAWS.bend as Laws
import ./board.bend as Board

# PROOF: induction on `x`, one rewrite (`%`) per step.
def Laws.add_zero(x):
  match x:
    case 0n:
      {==}
    case 1n+xp:
      %Laws.add_zero(xp) : {1n+Nat.add(xp, 0n) == 1n+_ : Nat}
      {==}

def Laws.stamp_eq_refl(k):
  match k:
    case Board.SMind{}:
      {==}
    case Board.SSchema{}:
      {==}
    case Board.SLogic{}:
      {==}
    case Board.SRepo{}:
      {==}
    case Board.SCtrl{}:
      {==}
    case Board.SGql{}:
      {==}
    case Board.SDriz{}:
      {==}
    case Board.SPrisma{}:
      {==}

def Laws.empty_elems_len():
  {==}
