---
"@call-e/cli": patch
---

Open the browser without cmd.exe on Windows during `auth login`.

`cmd /c start "" <url>` let cmd parse the OAuth URL, and `&` is a command separator there, so the URL was truncated at the first `&` (losing `redirect_uri`, `state` and `scope`) and the rest of the query string was run as shell commands. The opener is now `rundll32`, which takes the URL as a single argument, named by its fully qualified `%SystemRoot%\System32` path so the executable is not resolved through the current working directory.
