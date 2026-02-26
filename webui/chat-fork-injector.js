/**
 * Injects per-chat fork buttons into sidebar chat list items.
 * Places a fork icon next to the close (×) button inside each .chat-container.
 *
 * Agent Zero DOM structure:
 *   <ul class="config-list chats-config-list">
 *     <li>
 *       <div class="chat-container [chat-selected]">
 *         <div class="chat-list-button">
 *           <span class="project-color-ball">...</span>
 *           <span class="chat-name">Chat #7</span>
 *         </div>
 *         <button class="btn-icon-action chat-list-action-btn" title="Close chat">×</button>
 *       </div>
 *     </li>
 *   </ul>
 *
 * Store: $store.chats.contexts[] with .id, .name, .no
 */

let observer = null;

export function setup() {
  const trySetup = () => {
    const container = document.querySelector("ul.chats-config-list");
    if (container) {
      injectNew(container);
      observer = new MutationObserver(() => injectNew(container));
      observer.observe(container, { childList: true });
    } else {
      setTimeout(trySetup, 1000);
    }
  };
  trySetup();
}

function injectNew(container) {
  const chatsStore = window.Alpine?.store("chats");
  if (!chatsStore?.contexts) return;

  const items = container.querySelectorAll("li");
  items.forEach((li, index) => {
    // Skip items that already have a fork button
    if (li.querySelector(".lf-fork-btn")) return;

    const context = chatsStore.contexts[index];
    if (!context) return;

    const chatContainer = li.querySelector(".chat-container");
    if (!chatContainer) return;

    const closeBtn = chatContainer.querySelector(
      'button.chat-list-action-btn[title="Close chat"]',
    );

    const btn = document.createElement("button");
    btn.className = "btn-icon-action chat-list-action-btn lf-fork-btn";
    btn.title = "Fork this chat";

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.textContent = "call_split";
    icon.style.fontSize = "18px";
    btn.appendChild(icon);

    const contextId = context.id;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const forkStore = window.Alpine?.store("forkActions");
      if (forkStore) forkStore.forkChat(contextId);
    });

    if (closeBtn) {
      chatContainer.insertBefore(btn, closeBtn);
    } else {
      chatContainer.appendChild(btn);
    }
  });
}
