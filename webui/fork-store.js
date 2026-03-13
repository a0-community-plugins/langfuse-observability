import { createStore, getStore } from "/js/AlpineStore.js";
import { callJsonApi } from "/js/api.js";

const API = "/plugins/a0_community_plugins__langfuse_observability";

const model = {
  forking: false,
  error: "",
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
  },

  /**
   * Fork a specific chat context by ID.
   * Returns the new context ID on success, or null on failure.
   */
  async forkChat(contextId) {
    if (!contextId) {
      this.error = "No chat to fork";
      return null;
    }

    const chatsStore = getStore("chats");
    this.forking = true;
    this.error = "";

    try {
      const result = await callJsonApi(`${API}/chat_fork`, {
        context_id: contextId,
      });

      if (!result.success) {
        this.error = result.error || "Fork failed";
        return null;
      }

      // Refresh the chat list so the fork appears in the sidebar.
      // Try common refresh methods on the chats store.
      if (chatsStore?.loadContexts) {
        await chatsStore.loadContexts();
      } else if (chatsStore?.refreshContexts) {
        await chatsStore.refreshContexts();
      } else if (chatsStore?.load) {
        await chatsStore.load();
      }

      return result.new_context_id;
    } catch (e) {
      this.error = (e instanceof Error ? e.message : "Unknown error") || "Fork failed";
      return null;
    } finally {
      this.forking = false;
    }
  },

  /**
   * Fork the currently selected chat context.
   * Returns the new context ID on success, or null on failure.
   */
  async forkCurrentChat() {
    const chatsStore = getStore("chats");
    if (!chatsStore || !chatsStore.selected) {
      this.error = "No chat selected";
      return null;
    }
    return this.forkChat(chatsStore.selected);
  },

  /**
   * Fork a specific chat and open split view to compare.
   */
  async forkAndCompare(contextId) {
    const chatsStore = getStore("chats");
    const targetId = contextId || chatsStore?.selected;
    if (!targetId) {
      this.error = "No chat selected";
      return;
    }

    const newId = await this.forkChat(targetId);
    if (!newId) return;

    // Open split view comparing original vs fork
    const splitView = getStore("splitView");
    if (splitView) {
      splitView.openSplit(targetId, newId);
    }
  },

  /**
   * Open split view comparing two existing contexts.
   */
  compareChats(leftId, rightId) {
    const splitView = getStore("splitView");
    if (splitView) {
      splitView.openSplit(leftId, rightId);
    }
  },
};

export const store = createStore("forkActions", model);
