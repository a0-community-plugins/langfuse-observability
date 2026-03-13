/**
 * Injects "View Trace" buttons into each message's action button area.
 * Uses MutationObserver on #chat-history to detect new messages.
 * Maps messages to traces by walking backward through log items to find
 * the nearest trace_id in kvps.
 */

const API_PREFIX = "/plugins/a0_community_plugins__langfuse_observability";
let observer = null;
let logCache = null;
let cachedContextId = null;

export function setup() {
  const trySetup = () => {
    const chatHistory = document.getElementById("chat-history");
    if (chatHistory) {
      startObserving(chatHistory);
    } else {
      setTimeout(trySetup, 1000);
    }
  };
  trySetup();
}

function startObserving(chatHistory) {
  if (observer) return;

  // Inject into existing messages
  scanAndInject(chatHistory);

  // Watch for new messages
  observer = new MutationObserver(() => {
    // Invalidate log cache when new messages appear (new agent run completed)
    logCache = null;
    scanAndInject(chatHistory);
  });
  observer.observe(chatHistory, { childList: true, subtree: true });
}

function scanAndInject(container) {
  const areas = container.querySelectorAll(
    ".step-action-buttons:not(.lf-trace-done)",
  );
  areas.forEach((area) => {
    area.classList.add("lf-trace-done");

    const btn = document.createElement("button");
    btn.className = "action-button lf-trace-action";
    btn.title = "View Trace";
    btn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:18px">monitoring</span>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTraceForArea(area);
    });
    area.appendChild(btn);
  });
}

async function openTraceForArea(actionArea) {
  const chatsStore = globalThis.Alpine?.store("chats");
  const contextId = chatsStore?.selected;
  if (!contextId) return;

  const traceViewer = globalThis.Alpine?.store("traceViewer");
  if (!traceViewer) return;

  // Fetch logs (cached per context)
  if (cachedContextId !== contextId || !logCache) {
    logCache = await fetchLogs(contextId);
    cachedContextId = contextId;
  }

  if (!logCache?.length) {
    traceViewer.loadTrace("", "");
    traceViewer.error = "No logs found for this chat";
    globalThis.openModal(
      "/usr/plugins/a0_community_plugins__langfuse_observability/webui/trace-viewer.html",
    );
    return;
  }

  // Find all unique trace_ids from logs
  const traceLogs = logCache.filter((l) => l.kvps?.trace_id);
  if (!traceLogs.length) {
    traceViewer.loadTrace("", "");
    traceViewer.error = "No traces found (tracing may not be enabled)";
    globalThis.openModal(
      "/usr/plugins/a0_community_plugins__langfuse_observability/webui/trace-viewer.html",
    );
    return;
  }

  // Determine which action area was clicked (position among all action areas)
  const chatHistory = document.getElementById("chat-history");
  const allAreas = chatHistory
    ? [...chatHistory.querySelectorAll(".step-action-buttons")]
    : [];
  const areaIndex = allAreas.indexOf(actionArea);

  // Try to match the area position to a log item.
  // Not all log items produce action areas, so walk backward from the
  // approximate position to find the nearest trace_id.
  let traceId = null;
  let traceUrl = "";

  // First try: check if a log item at this index has trace data
  if (areaIndex >= 0 && areaIndex < logCache.length) {
    const log = logCache[areaIndex];
    if (log?.kvps?.trace_id) {
      traceId = log.kvps.trace_id;
      traceUrl = log.kvps.trace_url || "";
    }
  }

  // Second try: walk backward from the area position
  if (!traceId) {
    const startIdx = Math.min(
      areaIndex >= 0 ? areaIndex : logCache.length - 1,
      logCache.length - 1,
    );
    for (let i = startIdx; i >= 0; i--) {
      if (logCache[i]?.kvps?.trace_id) {
        traceId = logCache[i].kvps.trace_id;
        traceUrl = logCache[i].kvps.trace_url || "";
        break;
      }
    }
  }

  // Fallback: use the most recent trace
  if (!traceId) {
    const latest = traceLogs[traceLogs.length - 1];
    traceId = latest.kvps.trace_id;
    traceUrl = latest.kvps.trace_url || "";
  }

  traceViewer.loadTrace(traceId, traceUrl);
  globalThis.openModal(
    "/usr/plugins/a0_community_plugins__langfuse_observability/webui/trace-viewer.html",
  );
}

async function fetchLogs(contextId) {
  try {
    const resp = await globalThis.fetchApi(`${API_PREFIX}/chat_logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_id: contextId, log_from: 0 }),
    });
    const data = await resp.json();
    return data.success ? data.logs || [] : [];
  } catch {
    return [];
  }
}
