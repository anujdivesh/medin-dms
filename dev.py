#!/usr/bin/env python3
"""DMS local dev launcher.

Swaps backend/.env and pygeoapi-config.yml between local/docker variants,
then (for local mode) launches Elasticsearch, PyGeoAPI, Backend and Frontend
each as a tab in one shared Windows Terminal window.

Earlier versions shelled out to wt.exe with the actual command embedded in
a `-Command "..."` string. That broke two ways: wt splits its whole command
line on any literal ';' it sees, even one meant to stay nested inside a
quoted argument; and passing a command that itself contains nested quotes
(the WSL `bash -c "..."` invocations) through wt's own re-serialization
corrupted the quoting before it reached the child process. Both go away by
having wt launch `powershell -File <script.ps1> -Param value ...` instead -
flat, unquoted-internally arguments are all wt ever has to pass through;
the actual command (with its own &&/||/quoting) is built by run_console.ps1
/ run_wsl_console.ps1 from inside the already-running PowerShell process,
which wt never needs to see. `wt -w 0` targets the same shared window every
time, so all four services land as tabs instead of separate windows.

Usage: python dev.py
"""

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import winreg

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))


def resolve_wt_path():
    """Find wt.exe's real path via the "App Paths" registry key. It's not
    findable via a plain PATH search (confirmed: `shutil.which`/`where`/
    subprocess all fail to find it) - only ShellExecute-style resolution
    (what PowerShell's Start-Process uses) finds it that way, which
    subprocess.Popen does not do."""
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(hive, r"Software\Microsoft\Windows\CurrentVersion\App Paths\wt.exe") as key:
                return winreg.QueryValue(key, None)
        except FileNotFoundError:
            continue
    return "wt"  # fall back to a plain PATH lookup


WT_EXE = resolve_wt_path()


def copy_config_variant(target, variant, label):
    if not os.path.exists(variant):
        print(f"  ! missing {variant} - leaving {target} untouched")
        return
    shutil.copy2(variant, target)
    print(f"  - {label} -> {os.path.basename(target)}")


def set_config_mode(mode):
    print(f"Configuring backend + pygeoapi for '{mode}' mode...")

    env_target = os.path.join(REPO_ROOT, "backend", ".env")
    env_variant = os.path.join(REPO_ROOT, "backend", f".env.{mode}")
    copy_config_variant(env_target, env_variant, f"backend/.env.{mode}")

    pygeo_dir = os.path.join(REPO_ROOT, "pygeoapi", "pygeoapi-generate-config")
    pygeo_target = os.path.join(pygeo_dir, "pygeoapi-config.yml")
    pygeo_variant = os.path.join(pygeo_dir, f"pygeoapi-config.yml.{mode}")
    copy_config_variant(pygeo_target, pygeo_variant, f"pygeoapi-config.yml.{mode}")


WT_WINDOW = "0"  # reserved id - reused across separate `wt` invocations so every tab lands in the same window


def open_console(title, command, cwd=None):
    """Open `command` as a new tab in the shared Windows Terminal window,
    via run_console.ps1 (see module docstring for why -File, not
    -Command)."""
    script = os.path.join(REPO_ROOT, "run_console.ps1")
    subprocess.Popen([
        WT_EXE, "-w", WT_WINDOW, "nt", "--title", title,
        "powershell", "-NoExit", "-File", script,
        "-Title", title,
        "-WorkingDirectory", cwd or REPO_ROOT,
        "-Command", command,
    ])


def open_wsl_console(title, remote_path, venv_activate=".venv/bin/activate", run_command="python main.py"):
    """Open a WSL command as a new tab in the shared Windows Terminal
    window, via run_wsl_console.ps1 (see module docstring for why -File,
    not -Command)."""
    script = os.path.join(REPO_ROOT, "run_wsl_console.ps1")
    subprocess.Popen([
        WT_EXE, "-w", WT_WINDOW, "nt", "--title", title,
        "powershell", "-NoExit", "-File", script,
        "-Title", title,
        "-RemotePath", remote_path,
        "-VenvActivate", venv_activate,
        "-RunCommand", run_command,
    ])


def wait_for_service(name, url, timeout_seconds, interval=2):
    """Poll `url` until it responds at all (any HTTP status counts - even a
    401/404 means the server is alive and answering) or `timeout_seconds`
    elapses.
    """
    print(f"Waiting for {name} at {url} (up to {timeout_seconds}s)...")
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=3)
            print(f"  - {name} is up")
            return True
        except urllib.error.HTTPError:
            # got a real HTTP response (even an error status) - it's alive
            print(f"  - {name} is up")
            return True
        except Exception:
            time.sleep(interval)
    print(f"  ! {name} did not respond within {timeout_seconds}s - continuing anyway")
    return False


def start_local():
    set_config_mode("local")

    # Backend depends on pygeoapi/elasticsearch/frontend being reachable at
    # startup, so it's launched last, only once the other three are actually
    # answering requests, not just "started".
    print("Launching Elasticsearch...")
    open_console(
        "ElasticSearch",
        "docker compose -f docker-compose-local.yml up",
        cwd=os.path.join(REPO_ROOT, "elasticsearch"),
    )
    wait_for_service("Elasticsearch", "http://localhost:9200", timeout_seconds=60)

    print("Launching PyGeoAPI (WSL)...")
    open_wsl_console("PyGeoAPI", "/mnt/c/Code/dms_new/pygeoapi")
    wait_for_service("PyGeoAPI", "http://localhost:5000", timeout_seconds=90)

    print("Launching Frontend...")
    open_console(
        "FrontEnd",
        "npm run dev",
        cwd=os.path.join(REPO_ROOT, "frontend"),
    )
    wait_for_service("Frontend", "http://localhost:5173", timeout_seconds=60)

    print("Launching Backend (Django, WSL)...")
    open_wsl_console(
        "Backend",
        "/mnt/c/Code/dms_new/backend",
        run_command="python manage.py runserver 0.0.0.0:8000",
    )

    print()
    print("All services launched as tabs in one Windows Terminal window:")
    print("  Elasticsearch -> http://localhost:9200")
    print("  PyGeoAPI      -> http://localhost:5000")
    print("  Frontend      -> http://localhost:5173")
    print("  Backend       -> http://localhost:8000")


def start_docker():
    set_config_mode("docker")
    print()
    print("Config files are now set for docker/production.")
    print("This script does not start the container stack itself - run the")
    print("standard production command yourself when ready to deploy:")
    print()
    print("    docker compose up --build -d")
    print()


def main():
    print("DMS dev launcher")
    choice = input("Start in local or docker mode? (l/d): ").strip().lower()
    if choice == "l":
        start_local()
    elif choice == "d":
        start_docker()
    else:
        print("Invalid choice - enter 'l' or 'd'.")


if __name__ == "__main__":
    main()
