#!/usr/bin/env python3
"""Prepare disposable helpers, substitute runtime tokens, and run one level."""

from __future__ import annotations

import argparse
import http.server
import json
import os
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path


class BannerServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


class BannerHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        self.request.sendall(b"C3T challenge service\n")


class QuietHttpHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


def replace_tokens(values: list[str], tokens: dict[str, str]) -> list[str]:
    resolved = []
    for value in values:
        for token, replacement in tokens.items():
            value = value.replace("{" + token + "}", replacement)
        resolved.append(value)
    return resolved


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True)
    parser.add_argument("--args-json", required=True)
    parser.add_argument("--prepare", default="")
    options = parser.parse_args()

    raw_args = json.loads(options.args_json)
    if not isinstance(raw_args, list) or not all(isinstance(item, str) for item in raw_args):
        raise ValueError("--args-json must contain a JSON string array")

    tokens: dict[str, str] = {}
    helpers: list[object] = []
    try:
        if options.prepare == "sleeping-process":
            helper = subprocess.Popen(["sleep", "300"])
            helpers.append(helper)
            # The command process is a sibling of this helper. Reap the helper
            # here as soon as it exits so processKill observes a fully removed
            # PID instead of a zombie that remains visible until final cleanup.
            threading.Thread(target=helper.wait, daemon=True).start()
            tokens["helperPid"] = str(helper.pid)
        elif options.prepare == "banner-service":
            service = BannerServer(("127.0.0.1", 0), BannerHandler)
            thread = threading.Thread(target=service.serve_forever, daemon=True)
            thread.start()
            helpers.append(service)
            tokens["servicePort"] = str(service.server_address[1])
        elif options.prepare == "download-service":
            source = Path("/lab/challenge")
            handler = lambda *args, **kwargs: QuietHttpHandler(*args, directory=str(source), **kwargs)
            service = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=service.serve_forever, daemon=True)
            thread.start()
            helpers.append(service)
            tokens["downloadUrl"] = f"http://127.0.0.1:{service.server_address[1]}/download-source.json"
        elif options.prepare == "virtual-display":
            display = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1280x720x24", "-nolisten", "tcp"])
            helpers.append(display)
            os.environ["DISPLAY"] = ":99"
            os.environ["XDG_RUNTIME_DIR"] = "/tmp"
            time.sleep(0.35)

        command = [options.executable, *replace_tokens(raw_args, tokens)]
        print("[container] " + " ".join(command), flush=True)
        child = subprocess.Popen(command)

        def forward_signal(signum: int, _frame: object) -> None:
            child.send_signal(signum)

        signal.signal(signal.SIGTERM, forward_signal)
        signal.signal(signal.SIGINT, forward_signal)
        return child.wait()
    finally:
        for helper in reversed(helpers):
            if hasattr(helper, "shutdown"):
                helper.shutdown()
                helper.server_close()
            elif helper.poll() is None:
                helper.terminate()
                try:
                    helper.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    helper.kill()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"[container runner] {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
