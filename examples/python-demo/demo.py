"""AI Command Center - Python integration demo.

Run the gateway first:   npx ai-command-center start
Then:                    python demo.py

Uses whichever API keys you have exported (OPENAI_API_KEY / ANTHROPIC_API_KEY);
with no keys it still demonstrates the /api/track escape hatch, so the
dashboard always gets a record.
"""

import os
import sys
import time

# --- the entire integration ------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "packages", "sdk-python", "src"))
import aicc  # noqa: E402

aicc.init(project="python-demo")
# (equivalent zero-code alternative: export OPENAI_BASE_URL=http://localhost:4321/p/python-demo/openai/v1)
# ---------------------------------------------------------------------------


def try_openai() -> bool:
    if not os.environ.get("OPENAI_API_KEY"):
        return False
    try:
        from openai import OpenAI
    except ImportError:
        print("openai package not installed - skipping (pip install openai)")
        return False
    client = OpenAI()  # base_url already points at the gateway
    reply = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say hello from AI Command Center in 5 words."}],
    )
    print("openai:", reply.choices[0].message.content)
    return True


def try_anthropic() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        from anthropic import Anthropic
    except ImportError:
        print("anthropic package not installed - skipping (pip install anthropic)")
        return False
    client = Anthropic()  # base_url already points at the gateway
    reply = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=50,
        messages=[{"role": "user", "content": "Say hello from AI Command Center in 5 words."}],
    )
    print("anthropic:", reply.content[0].text)
    return True


def fallback_track() -> None:
    """No keys? Report a usage record directly so you can watch it appear live."""
    t0 = time.time()
    ok = aicc.track(
        provider="openai",
        model="gpt-4o-mini",
        tokens_in=1240,
        tokens_out=310,
        latency_ms=(time.time() - t0) * 1000 + 850,
    )
    print("tracked a sample record via /api/track:", "ok" if ok else "gateway unreachable")


if __name__ == "__main__":
    ran = False
    ran |= try_openai()
    ran |= try_anthropic()
    if not ran:
        print("No provider API keys found - using the /api/track fallback instead.")
        fallback_track()
    print("Open the dashboard: http://localhost:4321")
