"""aicc — thin client for AI Command Center.

The gateway does all the real work; this helper just points the official
provider SDKs at it via their standard environment variables.

    import aicc
    aicc.init(project="invoice-bot")          # BEFORE creating any clients

    from openai import OpenAI
    client = OpenAI()                          # now flows through the gateway

Works with: openai (OPENAI_BASE_URL), anthropic (ANTHROPIC_BASE_URL),
google-genai (GOOGLE_GEMINI_BASE_URL), and anything else via aicc.url("provider").
Your API keys are untouched — the gateway passes them through.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from urllib.parse import quote

__all__ = ["init", "url", "track", "AiccSession"]
__version__ = "0.1.0"

DEFAULT_GATEWAY = "http://localhost:4321"

_session: Optional["AiccSession"] = None


@dataclass
class AiccSession:
    gateway: str
    project: str
    env: Dict[str, str] = field(default_factory=dict)

    def url(self, provider: str) -> str:
        """Gateway base URL for any provider, e.g. url('openai') or url('ollama')."""
        base = f"{self.gateway}/p/{quote(self.project, safe='')}/{provider}"
        return base + "/v1" if provider not in ("anthropic", "gemini") else base


def init(
    project: str = "default",
    gateway: Optional[str] = None,
    check: bool = True,
) -> AiccSession:
    """Route this process's AI SDK traffic through AI Command Center.

    Call BEFORE constructing OpenAI()/Anthropic()/genai.Client() — the SDKs
    read their base-URL environment variables at construction time.

    project  – how calls are grouped on the dashboard.
    gateway  – gateway origin; defaults to $AICC_GATEWAY or http://localhost:4321.
    check    – ping the gateway and print a warning if it is unreachable.
    """
    global _session
    gw = (gateway or os.environ.get("AICC_GATEWAY") or DEFAULT_GATEWAY).rstrip("/")
    base = f"{gw}/p/{quote(project, safe='')}"

    env = {
        "OPENAI_BASE_URL": f"{base}/openai/v1",
        "OPENAI_API_BASE": f"{base}/openai/v1",  # legacy libs (openai<1, some frameworks)
        "ANTHROPIC_BASE_URL": f"{base}/anthropic",
        "GOOGLE_GEMINI_BASE_URL": f"{base}/gemini",
    }
    os.environ.update(env)
    _session = AiccSession(gateway=gw, project=project, env=env)

    if check:
        try:
            with urllib.request.urlopen(f"{gw}/health", timeout=1.5) as res:
                json.loads(res.read().decode("utf-8"))
        except Exception:
            print(
                f"[aicc] warning: no AI Command Center gateway at {gw} — "
                f"calls will fail until you run: npx ai-command-center start",
                file=sys.stderr,
            )
    return _session


def url(provider: str) -> str:
    """Gateway base URL for a provider (requires init() first)."""
    if _session is None:
        raise RuntimeError("aicc.init() has not been called")
    return _session.url(provider)


def track(
    *,
    project: Optional[str] = None,
    provider: str = "custom",
    model: Optional[str] = None,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
    cost_usd: Optional[float] = None,
    latency_ms: Optional[float] = None,
    ok: bool = True,
    error: Optional[str] = None,
    **extra: Any,
) -> bool:
    """Report usage for calls the gateway can't see (batch jobs, exotic providers).

    Returns True when the record was accepted, False when the gateway was
    unreachable (never raises — telemetry must not break the host app).
    """
    gw = _session.gateway if _session else (os.environ.get("AICC_GATEWAY") or DEFAULT_GATEWAY).rstrip("/")
    record = {
        "project": project or (_session.project if _session else "default"),
        "provider": provider,
        "model": model,
        "tokensIn": tokens_in,
        "tokensOut": tokens_out,
        "costUsd": cost_usd,
        "latencyMs": latency_ms,
        "ok": ok,
        "error": error,
        "ts": int(time.time() * 1000),
        **extra,
    }
    # Drop None-valued keys so the gateway treats them as absent (and, e.g.,
    # prices the record itself) rather than coercing null to 0.
    record = {k: v for k, v in record.items() if v is not None}
    req = urllib.request.Request(
        f"{gw}/api/track",
        data=json.dumps(record).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            return 200 <= res.status < 300
    except Exception:
        return False
