'use strict';

const notify = message => chrome.notifications.create({
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
      code: `
        window.windowId = ${tab.windowId};
        window.tabId = ${tab.id};
        window.src = "${tab.url}";
      `,
      runAt: 'document_start'
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        return notify(lastError.message);
      }
      chrome.tabs.executeScript({
        file: 'data/inject.js',
        runAt: 'document_start'
      });
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
        url: chrome.extension.getURL('data/popup/index.html') +
          '?tabId=' + tab.id +
          '&windowId=' + tab.windowId +
          '&src=' + encodeURIComponent(tab.url),
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
  else if (request.method === 'grab-links') {
    chrome.tabs.executeScript(request.tabId, {
      file: 'data/grab.js',
      runAt: 'document_start',
      allFrames: request.allFrames,
      matchAboutBlank: request.matchAboutBlank
    }, arr => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        return notify(lastError.message);
      }
      response(arr || []);
    });
    return true;
  }
  else if (request.method === 'fetch') {
    const r = new XMLHttpRequest();
    r.open('GET', request.link);
    r.timeout = 10000;
    r.onreadystatechange = () => {
      // http scheme
      if (request.link.startsWith('http')) {
        if (r.readyState === r.HEADERS_RECEIVED && request.body === false) {
          response({
            status: r.status,
            responseURL: r.responseURL
          });
          r.abort();
        }
        else if (r.readyState === r.DONE && request.body) {
          response({
            status: r.status,
            responseURL: r.responseURL,
            content: r.responseText
          });
        }
      }
      // file scheme
      else {
        if (r.readyState === r.DONE) {
          const o = {
            status: r.responseText ? 200 : r.status,
            responseURL: r.responseURL
          };
          if (request.body) {
            o.content = r.responseText;
          }
          response(o);
        }
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
    const tabId = request.tabId;
    chrome.tabs.executeScript(tabId, {
      allFrames: true,
      code: `{
        const a = [...document.querySelectorAll('a')].filter(a => a.href === '${request.link}').shift();
        if (a) {
          a.scrollIntoView({
            block: 'center',
            inline: 'nearest'
          });
          a.style['box-shadow'] = '0 0 0 2px ${request.bg}';
          a.style['background-color'] = '${request.bg}';
          a.style['color'] = '${request.color}';
          true
        }
        else {
          false
        }
      }`,
      matchAboutBlank: true,
      runAt: 'document_start'
    }, arr => {
      if (arr.some(a => a)) {
        chrome.tabs.update(tabId, {
          highlighted: true
        });
        chrome.windows.update(request.windowId, {
          focused: true
        });
      }
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

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install'
            });
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
