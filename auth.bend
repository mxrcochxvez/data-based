import Base

type User is Data:
  User{name: String}

def Auth.system() -> User:
  User{"ghost"}

def Auth.allowed(+name: String) -> Bool:
  String.eq(name, "ghost")

def Auth.on_allowed(+name: String, ok: Bool) -> Maybe<User>:
  match ok:
    case True{}:
      Some{User{name}}
    case False{}:
      None{}

def Auth.check(+name: String) -> Maybe<User>:
  Auth.on_allowed(name, Auth.allowed(name))
