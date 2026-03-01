"""
Podman 容器运行时工具
统一封装容器命令调用，避免在业务代码中散落 subprocess 细节
"""
import os
import subprocess
from typing import List, Optional


PODMAN_BIN = os.environ.get("PODMAN_BIN", "podman")
PODMAN_TIMEOUT = int(os.environ.get("PODMAN_TIMEOUT", "30"))
PODMAN_URL = os.environ.get("PODMAN_URL", "").strip()


def run_podman(
    args: List[str],
    timeout: Optional[int] = None,
    capture_output: bool = True,
    text: bool = True,
    check: bool = False,
) -> subprocess.CompletedProcess:
    """执行 Podman 命令"""
    if timeout is None:
        timeout = PODMAN_TIMEOUT

    command = [PODMAN_BIN]
    if PODMAN_URL:
        command.extend(["--url", PODMAN_URL])
    command.extend(args)

    return subprocess.run(
        command,
        check=check,
        capture_output=capture_output,
        timeout=timeout,
        text=text,
    )
