document.getElementById("open-yt").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      document.getElementById("status").textContent = "✅ Sidebar active on this tab!";
    } else {
      chrome.tabs.create({ url: "https://www.youtube.com" });
    }
  });
});
