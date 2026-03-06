"""
Chat fork helper for the observability plugin.

Imports private serialization functions from core persist_chat.py.
This is intentionally fragile — if core renames these functions, this breaks.
"""

import json
import uuid
from datetime import datetime
from typing import Any

from agent import AgentContext

# Fragile imports from core — these are private functions
from helpers.persist_chat import (
    _serialize_context,
    _deserialize_context,
    _safe_json_serialize,
)


def fork_context(source_context: AgentContext, fork_at_log_no=None):
    """Deep-copy a context, optionally truncating at a log position.

    Args:
        source_context: The context to fork from.
        fork_at_log_no: If provided, truncate the fork's log and history
            to include only items up to this log number.

    Returns:
        A new AgentContext instance with its own ID and log GUID.
    """
    source_id = source_context.id
    source_name = source_context.name or "Chat"

    # 1. Serialize and deep-copy via JSON round-trip
    serialized = _serialize_context(source_context)
    data = json.loads(_safe_json_serialize(serialized, ensure_ascii=False))

    # 2. Optionally truncate at the fork point
    if fork_at_log_no is not None:
        _truncate_fork_data(data, fork_at_log_no)

    # 3. Remove ID so _deserialize_context generates a new one
    if "id" in data:
        del data["id"]

    # 4. Auto-name with collision check
    base_name = f"{source_name} (fork)"
    existing_names = {ctx.name for ctx in AgentContext.all()}
    fork_name = base_name
    counter = 2
    while fork_name in existing_names:
        fork_name = f"{source_name} (fork {counter})"
        counter += 1
    data["name"] = fork_name

    # 5. Store fork metadata (in both data and output_data so UI can see it)
    fork_info = {
        "forked_from": source_id,
        "fork_point": fork_at_log_no,
        "fork_timestamp": datetime.now().isoformat(),
    }
    data.setdefault("data", {})
    data["data"]["fork_info"] = fork_info
    data.setdefault("output_data", {})
    data["output_data"]["fork_info"] = fork_info

    # 6. Generate new log GUID for fresh polling state
    data.setdefault("log", {})
    data["log"]["guid"] = str(uuid.uuid4())

    # 7. Deserialize into a new context
    return _deserialize_context(data)


def _truncate_fork_data(data: dict[str, Any], fork_at_log_no: int):
    """Truncate serialized context data at a specific log item number.

    Filters the log to keep only items where no <= fork_at_log_no, then
    truncates agent 0's history to match the remaining user/response count.

    Args:
        data: Serialized context dict (mutated in place).
        fork_at_log_no: The log item number to truncate at (inclusive).
    """
    # 1. Filter log items
    logs = data.get("log", {}).get("logs", [])
    truncated_logs = [item for item in logs if item.get("no", 0) <= fork_at_log_no]
    data["log"]["logs"] = truncated_logs

    # 2. Count user-type and response-type (agent 0) log items
    user_count = 0
    response_count = 0
    for item in truncated_logs:
        item_type = item.get("type", "")
        if item_type == "user":
            user_count += 1
        elif item_type == "response" and item.get("agent_number", item.get("agentno", -1)) == 0:
            response_count += 1

    keep_messages = user_count + response_count

    # 3. Truncate agent 0's history
    agents = data.get("agents", [])
    for agent_data in agents:
        if agent_data.get("number", -1) != 0:
            continue
        history_str = agent_data.get("history", "")
        if not history_str:
            break
        try:
            hist = json.loads(history_str)
        except (json.JSONDecodeError, TypeError):
            break
        current = hist.get("current", {})
        messages = current.get("messages", [])
        if len(messages) > keep_messages:
            current["messages"] = messages[:keep_messages]
        agent_data["history"] = json.dumps(hist)
        break
