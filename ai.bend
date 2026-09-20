import Base
import ./board.bend as B

def Ai.when(eq: Bool, yes: B.Cmd, no: B.Cmd) -> B.Cmd:
  Bool.pick(B.Cmd, eq, yes, no)

def Ai.parse(+text: String) -> B.Cmd:
  Ai.when(
    String.eq(text, "market"),
    B.OpenMarket{},
    Ai.when(
      String.eq(text, "edit"),
      B.OpenEdit{},
      Ai.when(String.eq(text, "chat"), B.Noop{}, B.Noop{})
    )
  )
