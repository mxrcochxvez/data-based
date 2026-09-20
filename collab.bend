# Live presence is TCP.listen + Board.apply on Wire.text, not Clerk.
import Base
import ./board.bend as B

type Wire is Data:
  Wire{text: String}

def Collab.encode(+text: String) -> Wire:
  Wire{text}

def Collab.decode(w: Wire) -> String:
  Wire{+text} = w
  text

def Collab.tcp_out(+text: String) -> Wire:
  Collab.encode(text)

def Collab.udp_out(+text: String) -> Wire:
  Collab.encode(text)

def Collab.chan_out(+text: String) -> Wire:
  Collab.encode(text)

def Collab.ingest(+b: B.Board, w: Wire) -> B.Board:
  b
