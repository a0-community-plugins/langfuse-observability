import os
import sys
import random
import logging
import subprocess
from typing import Any

logger = logging.getLogger(__name__)

# Lazy-loaded singleton
_client = None
_client_initialized = False
_install_attempted = False


def _ensure_langfuse_installed():
    """Auto-install langfuse package if not present."""
    global _install_attempted
    if _install_attempted:
        return
    _install_attempted = True
    try:
        import langfuse  # noqa: F401
    except ImportError:
        logger.info("langfuse package not found, installing...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "langfuse"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info("langfuse package installed successfully")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to install langfuse: {e}")


def get_langfuse_config() -> dict[str, Any]:
    """Get Langfuse configuration with plugin config > env var > default precedence."""
    from helpers.plugins import get_plugin_config

    config = get_plugin_config("a0_community_plugins__langfuse_observability", None) or {}
    public_key = config.get("langfuse_public_key") or os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = config.get("langfuse_secret_key") or os.getenv("LANGFUSE_SECRET_KEY", "")
    host = config.get("langfuse_host") or os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com")
    enabled = config.get("langfuse_enabled", False)
    sample_rate = float(config.get("langfuse_sample_rate", 1.0))

    # Auto-enable if keys are set via env vars but toggle is off
    if not enabled and public_key and secret_key:
        enabled = True

    return {
        "enabled": enabled,
        "public_key": public_key,
        "secret_key": secret_key,
        "host": host,
        "sample_rate": sample_rate,
    }


def get_langfuse_client():
    """Get or create the Langfuse client singleton. Returns None if disabled or not configured."""
    global _client, _client_initialized

    config = get_langfuse_config()

    if not config["enabled"] or not config["public_key"] or not config["secret_key"]:
        _client = None
        _client_initialized = False
        return None

    # Return cached client if already initialized
    if _client_initialized and _client is not None:
        return _client

    _ensure_langfuse_installed()

    try:
        from langfuse import Langfuse

        _client = Langfuse(
            public_key=config["public_key"],
            secret_key=config["secret_key"],
            host=config["host"],
        )
        _client_initialized = True
        logger.info("Langfuse client initialized successfully")
        return _client
    except Exception as e:
        logger.warning(f"Failed to initialize Langfuse client: {e}")
        _client = None
        _client_initialized = False
        return None


def reset_client():
    """Reset the client singleton (call when settings change)."""
    global _client, _client_initialized
    if _client:
        try:
            _client.flush()
        except Exception:
            pass
    _client = None
    _client_initialized = False


def should_sample() -> bool:
    """Check if this interaction should be sampled based on sample_rate."""
    config = get_langfuse_config()
    rate = config.get("sample_rate", 1.0)
    if rate >= 1.0:
        return True
    if rate <= 0.0:
        return False
    return random.random() < rate
