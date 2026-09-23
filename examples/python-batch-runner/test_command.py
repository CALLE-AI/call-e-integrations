import json
import os
import sys
from unittest.mock import patch

import pytest

import client


def test_windows_command_paths_preserve_backslashes():
    with patch.object(client.sys, "platform", "win32"):
        assert client.parse_cli_command(r"C:\tools\calle.cmd") == [r"C:\tools\calle.cmd"]
        assert client.parse_cli_command(r'"C:\Program Files\nodejs\node.exe" "C:\tools\calle.js"') == [
            r"C:\Program Files\nodejs\node.exe", r"C:\tools\calle.js"
        ]


def test_existing_executable_path_with_spaces(tmp_path):
    executable = tmp_path / "my cli"
    executable.touch()
    assert client.parse_cli_command(str(executable)) == [str(executable)]


def test_launch_uses_resolved_command_and_preserves_arguments():
    with patch.object(client.shutil, "which", return_value=r"C:\npm\calle.cmd"), patch.object(client.subprocess, "run") as run:
        assert client.executable_exists(["calle"])
        client.run_command(["calle", "auth", "status", "--cache-root", "path with spaces"])
        assert run.call_args.args[0] == [r"C:\npm\calle.cmd", "auth", "status", "--cache-root", "path with spaces"]
        assert run.call_args.kwargs.get("shell", False) is False


def test_missing_command_has_actionable_error():
    with patch.object(client.shutil, "which", return_value=None):
        with pytest.raises(client.CliUnavailableError, match="Executable not found"):
            client.run_command(["missing-calle", "--help"])


@pytest.mark.skipif(sys.platform != "win32", reason="Windows npm shim lookup")
def test_windows_cmd_lookup_and_launch(tmp_path, monkeypatch):
    shim = tmp_path / "calle.cmd"
    shim.write_text('@echo off\necho {"usable":true}\n')
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + os.environ["PATH"])
    assert client.executable_exists(["calle"])
    result = client.run_command(["calle", "auth", "status", "--json"])
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"usable": True}


def test_documented_python_launcher():
    import re
    import shutil
    import subprocess
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    section = (root / "docs/install/troubleshooting.md").read_text().split(
        "## Run CALL-E from Python on Windows", 1
    )[1].split("## Run CALL-E from Node on Windows", 1)[0]
    code = re.search(r"```python\n(.*?)```", section, re.S).group(1)
    code = code.replace(r"C:\Program Files\nodejs\node.exe", shutil.which("node"))
    code = code.replace(r"C:\trusted\node_modules\@call-e\cli", str(root / "packages/cli"))
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert "Usage: calle" in result.stdout


def test_explicit_relative_path_does_not_select_path_namesake(tmp_path, monkeypatch):
    name = "local cli.cmd" if sys.platform == "win32" else "local cli"
    local = tmp_path / name
    shadow_dir = tmp_path / "path-bin"
    shadow_dir.mkdir()
    for path, output in [(local, "local"), (shadow_dir / name, "shadow")]:
        prefix = "@echo off\n" if sys.platform == "win32" else "#!/bin/sh\n"
        path.write_text(prefix + f"echo {output}\n")
        path.chmod(0o755)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PATH", str(shadow_dir) + os.pathsep + os.environ["PATH"])
    explicit = "./" + name
    for value in [explicit, f'"{explicit}" --help']:
        command = client.parse_cli_command(value)
        assert client.executable_exists(command)
        result = client.run_command(command)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "local"
    assert client.run_command([name]).stdout.strip() == "shadow"


def test_non_executable_file_fails_precheck_on_posix(tmp_path):
    if sys.platform == "win32":
        pytest.skip("POSIX executable permission")
    path = tmp_path / "not-executable"
    path.touch(mode=0o600)
    assert not client.executable_exists([str(path)])
    with pytest.raises(client.CliUnavailableError, match="Executable not found"):
        client.run_command([str(path)])
