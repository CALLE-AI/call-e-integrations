"""Checks of the shared Python guard; no real socket or command is attempted."""
import os
import socket
import subprocess
import unittest

from tests.offline import offline_guard


class OfflineGuardTests(unittest.TestCase):
    def test_socket_and_dns_entry_points_are_blocked(self):
        with offline_guard():
            for fn, args in [
                (socket.socket, ()),
                (socket.create_connection, (("fixture.invalid", 443),)),
                (socket.getaddrinfo, ("fixture.invalid", 443)),
                (socket.gethostbyname, ("fixture.invalid",)),
                (socket.gethostbyname_ex, ("fixture.invalid",)),
                (socket.gethostbyaddr, ("127.0.0.1",)),
                (socket.getnameinfo, (("127.0.0.1", 443), 0)),
            ]:
                with self.subTest(entry=fn), self.assertRaisesRegex(RuntimeError, "offline-test guard"):
                    fn(*args)

    def test_process_entry_points_are_blocked(self):
        with offline_guard():
            for fn, args in [(subprocess.Popen, (["fixture-never-execute"],)), (os.system, ("fixture-never-execute",)), (os.popen, ("fixture-never-execute",)), (os.execv, ("fixture-never-execute", ["fixture-never-execute"]))]:
                with self.subTest(entry=fn), self.assertRaisesRegex(RuntimeError, "offline-test guard"):
                    fn(*args)

    def test_guard_restores_previous_bindings_and_nests(self):
        original = socket.getaddrinfo
        with offline_guard():
            outer = socket.getaddrinfo
            with offline_guard():
                self.assertIsNot(socket.getaddrinfo, outer)
            self.assertIs(socket.getaddrinfo, outer)
        self.assertIs(socket.getaddrinfo, original)
