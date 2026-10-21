"""Guard accidental Python network/process I/O; not an OS security sandbox."""
from contextlib import ExitStack, contextmanager
import os
from unittest.mock import patch


@contextmanager
def offline_guard():
    """Use before importing/discovering tests or diagnostics, not just in setUp."""
    targets = [
        "socket.socket", "socket.create_connection", "socket.getaddrinfo",
        "socket.gethostbyname", "socket.gethostbyname_ex", "socket.gethostbyaddr",
        "socket.getnameinfo", "subprocess.Popen", "os.system", "os.popen",
    ]
    targets += [f"os.{name}" for name in dir(os)
                if name.startswith(("exec", "spawn", "posix_spawn")) or name in {"fork", "forkpty"}]
    with ExitStack() as stack:
        for target in targets:
            stack.enter_context(patch(target, side_effect=RuntimeError("offline-test guard")))
        yield
