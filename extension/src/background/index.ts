// Service worker: opens the side panel from the toolbar icon and the welcome page on first install.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

// Also set the behavior on worker start, in case the install event was missed (e.g. after a reload).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
