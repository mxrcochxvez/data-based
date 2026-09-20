import Base
import ./board.bend as Board
import ./view.bend as View
import ./tick.bend as Tick

def main() -> IO(Unit):
  App.run(
    ~Board.Board,
    ~App{View.Shell.view, Tick.Shell.tick},
    "data-based",
    1024,
    1024,
    Board.Board.start()
  )
