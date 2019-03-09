'use strict';

var notify = message => chrome.notifications.create({
  iconUrl: 'data/icons/48.png',
  message,
  title: chrome.runtime.getManifest().name,
  type: 'basic'
});

chrome.browserAction.onClicked.addListener(tab => chrome.storage.local.get({
  'mode': 'window'
}, prefs => {
  if (prefs.mode === 'inline') {
    chrome.tabs.executeScript({
      file: 'data/inject.js',
      runAt: 'document_start'
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify(lastError.message);
      }
    });
  }
  else {
    chrome.storage.local.get({
      width: 700,
      height: 600,
      left: screen.availLeft + Math.round((screen.availWidth - 700) / 2),
      top: screen.availTop + Math.round((screen.availHeight - 500) / 2)
    }, prefs => {
      chrome.windows.create({
        url: chrome.extension.getURL('data/popup/index.html?tabId=' + tab.id),
        width: prefs.width,
        height: prefs.height,
        left: prefs.left,
        top: prefs.top,
        type: 'popup'
      });
    });
  }
}));

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'close-me') {
    chrome.tabs.executeScript(sender.tab.id, {
      code: 'window.iframe.remove()',
      runAt: 'document_start'
    });
  }
  else if (request.method === 'self-id') {
    response(sender.tab.id);
  }
  else if (request.method === 'grab-links') {
    const tabId = request.tabId || sender.tab.id;
    chrome.tabs.executeScript(tabId, {
      code: `var tabId = ${request.selfId};`,
      runAt: 'document_start',
      allFrames: request.allFrames,
      matchAboutBlank: request.matchAboutBlank
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        return notify(lastError.message);
      }
      chrome.tabs.executeScript(tabId, {
        file: 'data/grab.js',
        runAt: 'document_start',
        allFrames: request.allFrames,
        matchAboutBlank: request.matchAboutBlank
      });
    });
  }
  else if (request.method === 'link-collector') {
    const tabId = request.tabId || sender.tab.id;
    request.method = 'link-collector-bounced';
    chrome.tabs.sendMessage(tabId, request);
  }
  else if (request.method === 'fetch') {
    const r = new XMLHttpRequest();
    r.open('GET', request.link);
    r.timeout = 10000;
    r.onreadystatechange = () => {
      if (r.readyState === r.HEADERS_RECEIVED) {
        response({
          status: r.status,
          responseURL: r.responseURL
        });
        r.abort();
      }
    };
    r.ontimeout = () => response({
      status: 504
    });
    r.onerror = () => response({
      status: r.status
    });
    r.send();
    return true;
  }
  else if (request.method === 'inspect') {
    const tabId = request.tabId || sender.tab.id;
    chrome.tabs.executeScript(tabId, {
      allFrames: true,
      code: `{
        if (location.hostname === '${request.hostname}') {
          const a = [...document.querySelectorAll('a')].filter(a => a.href === '${request.link}').shift();
          if (a) {
            a.scrollIntoView({
              block: 'center',
              inline: 'nearest'
            });
            a.style['box-shadow'] = '0 0 0 2px ${request.bg}';
            a.style['background-color'] = '${request.bg}';
            a.style['color'] = '${request.color}';
          }
        }
      }`,
      matchAboutBlank: true,
      runAt: 'document_start'
    });
  }
});
/* context menu */
{
  const onStartup = () => chrome.storage.local.get({
    mode: 'window'
  }, prefs => {
    chrome.contextMenus.create({
      title: 'Open in "popup" Window',
      id: 'window',
      checked: prefs.mode === 'window',
      contexts: ['browser_action'],
      type: 'radio'
    });
    chrome.contextMenus.create({
      title: 'Open in "inline" Frame',
      id: 'inline',
      checked: prefs.mode === 'inline',
      contexts: ['browser_action'],
      type: 'radio'
    });
  });
  chrome.runtime.onInstalled.addListener(onStartup);
  chrome.runtime.onStartup.addListener(onStartup);
}
chrome.contextMenus.onClicked.addListener(info => chrome.storage.local.set({
  mode: info.menuItemId
}));
