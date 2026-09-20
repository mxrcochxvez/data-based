import Base

type User is Data:
  User{name: String}

# Production allowlist is SYSTEM_USER_EMAIL / DATABSED_SYSTEM_EMAIL in the web server,
# not this Bend stub.
def Auth.system() -> User:
  User{"system"}

def Auth.allowed(+name: String) -> Bool:
  String.neq(name, "")

def Auth.on_allowed(+name: String, ok: Bool) -> Maybe<User>:
  match ok:
    case True{}:
      Some{User{name}}
    case False{}:
      None{}

def Auth.check(+name: String) -> Maybe<User>:
  Auth.on_allowed(name, Auth.allowed(name))
