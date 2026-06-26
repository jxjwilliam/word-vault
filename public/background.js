// Word Vault — Chrome Extension Service Worker
// Handles side panel lifecycle and context menu for quick word lookup

const API_BASE = "https://translate-word-vault.vercel.app";

// ---------------------------------------------------------------------------
// On install: set up side panel + context menu
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  // Ensure side panel opens on action click
  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({
      enabled: true,
      path: "index.html",
    });
  }

  // Create context menu items
  chrome.contextMenus.create({
    id: "add-word",
    title: '添加 "%s" 到生词库',
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "lookup-word",
    title: '查询 "%s"',
    contexts: ["selection"],
  });
});

// ---------------------------------------------------------------------------
// On action click: open side panel
// ---------------------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel) {
    await chrome.sidePanel.open({ tabId: tab.id || undefined });
  }
});

// ---------------------------------------------------------------------------
// Context menu click handler
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  if (info.menuItemId === "add-word") {
    // Store selected text so the React app can read it on mount
    await chrome.storage.session.set({
      wordVaultPrefill: {
        sourceText: selectedText,
        timestamp: Date.now(),
      },
    });

    // Open side panel
    if (chrome.sidePanel && tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      // Reload the side panel so it picks up the new prefill data
      // (the panel might already be open)
      if (chrome.runtime) {
        try {
          await chrome.runtime.sendMessage({ type: "prefill-updated" });
        } catch {
          // Panel not open — will read on next open
        }
      }
    }
  }

  if (info.menuItemId === "lookup-word") {
    // Quick lookup: store text and open side panel in search mode
    await chrome.storage.session.set({
      wordVaultLookup: {
        query: selectedText,
        timestamp: Date.now(),
      },
    });

    if (chrome.sidePanel && tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      try {
        await chrome.runtime.sendMessage({ type: "lookup-updated" });
      } catch {
        // Panel not open
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Handle messages from the side panel (React app)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-prefill") {
    chrome.storage.session.get(["wordVaultPrefill", "wordVaultLookup"]).then((data) => {
      sendResponse(data);
    });
    return true; // keep channel open for async response
  }

  if (message.type === "clear-prefill") {
    chrome.storage.session.remove(["wordVaultPrefill", "wordVaultLookup"]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
