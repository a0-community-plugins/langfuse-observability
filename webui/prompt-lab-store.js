import { createStore } from "/js/AlpineStore.js";
import { callJsonApi } from "/js/api.js";

// Plugin API prefix
const API = "/plugins/a0_community_plugins__langfuse_observability";
const closeModal = /** @type {(modalPath?: string | null) => Promise<unknown> | unknown} */ (
  globalThis.closeModal
);

/**
 * @typedef {{ prompt?: string, [key: string]: unknown }} PromptVariant
 */

const model = {
  // Original prompt data (read-only, from trace observation)
  originalPrompt: "",
  originalResponse: "",
  observationModel: "",
  tokenCount: 0,
  cost: 0,
  userMessage: "",

  // Editor state
  editorPrompt: "",
  undoStack: /** @type {string[]} */ ([]),

  // Refiner/Judge state
  refining: false,
  judging: false,
  variants: /** @type {PromptVariant[]} */ ([]),

  // Test state
  testing: false,
  testResult: "",
  testForkedContextId: /** @type {string | null} */ (null),

  // Source context for forking
  sourceContextId: "",
  forkAtLogNo: /** @type {number | null} */ (null),

  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
  },

  open({
    systemPrompt,
    response,
    model,
    tokenCount,
    cost,
    userMessage,
    contextId,
    logNo,
  }) {
    this.originalPrompt = systemPrompt || "";
    this.originalResponse = response || "";
    this.observationModel = model || "";
    this.tokenCount = tokenCount || 0;
    this.cost = cost || 0;
    this.userMessage = userMessage || "";
    this.editorPrompt = systemPrompt || "";
    this.undoStack = [];
    this.variants = [];
    this.refining = false;
    this.judging = false;
    this.testing = false;
    this.testResult = "";
    this.testForkedContextId = null;
    this.sourceContextId = contextId || "";
    this.forkAtLogNo = logNo ?? null;
  },

  selectVariant(index) {
    if (index < 0 || index >= this.variants.length) return;
    const variant = this.variants[index];
    if (!variant?.prompt) return;
    this.undoStack.push(this.editorPrompt);
    this.editorPrompt = variant.prompt;
  },

  undo() {
    if (this.undoStack.length === 0) return;
    const previous = this.undoStack.pop();
    if (typeof previous === "string") this.editorPrompt = previous;
  },

  resetEditor() {
    this.undoStack.push(this.editorPrompt);
    this.editorPrompt = this.originalPrompt;
  },

  async suggestImprovements() {
    if (this.refining || this.judging) return;

    this.refining = true;
    this.variants = [];

    try {
      const refineResult = await callJsonApi(`${API}/prompt_refine`, {
        system_prompt: this.editorPrompt,
        user_message: this.userMessage,
        response: this.originalResponse,
        model: this.observationModel,
        token_count: this.tokenCount,
      });

      if (!refineResult.success) {
        globalThis.toast(refineResult.error || "Refiner failed", "error");
        this.refining = false;
        return;
      }

      const rawVariants = refineResult.variants || [];
      if (rawVariants.length === 0) {
        globalThis.justToast("No improvements suggested", "info", 2000, "prompt-lab");
        this.refining = false;
        return;
      }

      this.refining = false;
      this.judging = true;

      const judgeResult = await callJsonApi(`${API}/prompt_judge`, {
        original_prompt: this.originalPrompt,
        original_response: this.originalResponse,
        variants: rawVariants,
      });

      if (!judgeResult.success) {
        this.variants = rawVariants.map((v) => ({
          ...v,
          approved: true,
          scores: null,
          reasoning: "Judge unavailable",
        }));
        this.judging = false;
        return;
      }

      const judgeResults = judgeResult.results || [];
      this.variants = rawVariants.map((v, i) => {
        const judgment =
          judgeResults.find((j) => j.variant_index === i) || {};
        return {
          ...v,
          approved: judgment.approved ?? true,
          scores: judgment.scores || null,
          reasoning: judgment.reasoning || "",
        };
      });

      this.judging = false;
    } catch (e) {
      this.refining = false;
      this.judging = false;
      globalThis.toastFetchError("Prompt improvement failed", e);
    }
  },

  async testPrompt() {
    if (this.testing) return;
    this.testing = true;
    this.testResult = "";

    try {
      /** @type {{ context_id: string, fork_at_log_no?: number }} */
      const payload = { context_id: this.sourceContextId };
      if (this.forkAtLogNo != null) {
        payload.fork_at_log_no = this.forkAtLogNo;
      }

      const result = await callJsonApi(`${API}/chat_fork`, payload);

      if (!result.success) {
        globalThis.toast(result.error || "Test fork failed", "error");
        this.testing = false;
        return;
      }

      this.testForkedContextId = result.context_id;
      this.testResult = `Forked to "${result.name}". Switch to the forked chat to continue with the modified prompt.`;
      this.testing = false;
      globalThis.justToast("Test fork created", "success", 2000, "prompt-lab");
    } catch (e) {
      this.testing = false;
      globalThis.toastFetchError("Test failed", e);
    }
  },

  goToTestFork() {
    if (!this.testForkedContextId) return;
    const chatsStore = globalThis.Alpine?.store("chats");
    if (chatsStore) {
      chatsStore.selectChat(this.testForkedContextId);
    }
    closeModal(
      "/usr/plugins/a0_community_plugins__langfuse_observability/webui/prompt-lab.html",
    );
  },

  compareInSplitView() {
    if (!this.testForkedContextId || !this.sourceContextId) {
      globalThis.justToast("Fork a test chat first", "info", 2000, "prompt-lab");
      return;
    }
    const splitView = globalThis.Alpine?.store("splitView");
    if (!splitView) {
      globalThis.justToast("Split view not available", "error", 2000, "prompt-lab");
      return;
    }
    // Close the prompt lab modal, then open split view
    closeModal(
      "/usr/plugins/a0_community_plugins__langfuse_observability/webui/prompt-lab.html",
    );
    splitView.openSplit(
      this.sourceContextId,
      this.testForkedContextId,
      this.forkAtLogNo,
    );
  },

  cleanup() {
    this.originalPrompt = "";
    this.originalResponse = "";
    this.observationModel = "";
    this.tokenCount = 0;
    this.cost = 0;
    this.userMessage = "";
    this.editorPrompt = "";
    this.undoStack = [];
    this.variants = [];
    this.refining = false;
    this.judging = false;
    this.testing = false;
    this.testResult = "";
    this.testForkedContextId = null;
    this.sourceContextId = "";
    this.forkAtLogNo = null;
  },
};

export const store = createStore("promptLab", model);
