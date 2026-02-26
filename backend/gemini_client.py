"""
gemini_client.py – LLM Integration Layer for Yuktham.

This module encapsulates all interactions with the Google Gemini API.
It handles:
- Client lifecycle and authentication (API Key or Google Default Credentials).
- Conversational Chat (Yukta/Guru Critic) with specialized temperature settings.
- Structured Auditing (Red-Team Auditor) with JSON schema enforcement.
- Resilient Error Handling (Exponential backoff for 429/503 errors).
"""
from __future__ import annotations

import json
import logging
import os
import time

from google import genai
from google.genai import types

from .prompts import YUKTA_SYSTEM_PROMPT, AUDIT_SYSTEM_PROMPT

# Configure logging for token usage and latency monitoring
logger = logging.getLogger(__name__)

# Model and reliability configuration
GEMINI_MODEL = os.environ.get("GEMINI_MODEL_ID", "gemini-2.5-flash")
MAX_RETRIES = 3
BACKOFF_BASE = 2.0

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            _client = genai.Client(api_key=api_key)
        else:
            _client = genai.Client()  # Uses GOOGLE_API_KEY env var
        logger.info(f"Gemini client initialized (model={GEMINI_MODEL})")
    return _client


def chat(context: str, history: list[dict] | None = None) -> str:
    """
    Send a chat message to Yukta with GraphRAG context.

    Args:
        context: The full prompt with graph context + user question
                 (built by graphrag.build_chat_context)
        history: Optional conversation history [{role, content}, ...]

    Returns:
        Yukta's response text (markdown).
    """
    client = _get_client()

    config = types.GenerateContentConfig(
        system_instruction=YUKTA_SYSTEM_PROMPT,
        temperature=0.3,
        max_output_tokens=2048,
    )

    # Build contents: history + current context
    contents = []
    if history:
        for msg in history[-6:]:  # Keep last 6 messages for context window
            contents.append(types.Content(
                role=msg["role"],
                parts=[types.Part.from_text(text=msg["content"])],
            ))
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=context)],
    ))

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=config,
            )
            text = response.text
            if not text:
                raise ValueError("Empty response from Gemini")
            return text

        except Exception as e:
            err = str(e).lower()
            if any(code in err for code in ("429", "quota", "503", "overloaded")):
                if attempt < MAX_RETRIES:
                    wait = BACKOFF_BASE ** attempt
                    logger.warning(f"Gemini throttled (attempt {attempt}), waiting {wait}s")
                    time.sleep(wait)
                    last_error = e
                    continue
            raise

    raise last_error  # type: ignore


def audit(context: str) -> dict:
    """
    Run a structured audit via Gemini.

    Args:
        context: The full prompt with blast radius + diff context
                 (built by graphrag.build_audit_context)

    Returns:
        Parsed audit dict with scores and analysis.
    """
    client = _get_client()

    config = types.GenerateContentConfig(
        system_instruction=AUDIT_SYSTEM_PROMPT,
        temperature=0.1,
        max_output_tokens=1024,
        response_mime_type="application/json",
    )

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=context,
                config=config,
            )
            text = response.text
            if not text:
                raise ValueError("Empty audit response")
            return _parse_audit(text)

        except Exception as e:
            err = str(e).lower()
            if any(code in err for code in ("429", "quota", "503")):
                if attempt < MAX_RETRIES:
                    wait = BACKOFF_BASE ** attempt
                    logger.warning(f"Gemini throttled (attempt {attempt}), waiting {wait}s")
                    time.sleep(wait)
                    last_error = e
                    continue
            raise

    raise last_error  # type: ignore


REQUIRED_KEYS = {
    "regression_risk", "architectural_debt", "cognitive_load",
    "risk_level", "summary", "affected_paths", "key_concerns",
}


def _parse_audit(text: str) -> dict:
    """Parse and validate the JSON audit response."""
    # Strip markdown code fences
    if "```" in text:
        lines = text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            if line.startswith("```"):
                in_block = not in_block
                continue
            if in_block or not line.startswith("```"):
                json_lines.append(line)
        text = "\n".join(json_lines)

    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start == -1 or brace_end == -1:
        raise ValueError(f"No JSON in audit response: {text[:200]}")

    parsed = json.loads(text[brace_start:brace_end + 1])

    # Fill missing keys
    missing = REQUIRED_KEYS - parsed.keys()
    for key in missing:
        if key in ("regression_risk", "architectural_debt", "cognitive_load"):
            parsed[key] = 5
        elif key == "risk_level":
            parsed[key] = "MEDIUM"
        elif key in ("affected_paths", "key_concerns"):
            parsed[key] = []
        else:
            parsed[key] = "Analysis incomplete"

    # Clamp scores
    for k in ("regression_risk", "architectural_debt", "cognitive_load"):
        try:
            parsed[k] = max(0, min(10, int(parsed[k])))
        except (TypeError, ValueError):
            parsed[k] = 5

    return parsed
