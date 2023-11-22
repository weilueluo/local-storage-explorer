chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === "retrieve") {
        sendResponse({ ...localStorage });
    }
})