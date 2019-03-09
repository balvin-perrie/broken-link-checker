/* globals tabId */
'use strict';

{
  const links = [...document.querySelectorAll('a')].map(a => a.href).filter(s => s);
  chrome.runtime.sendMessage({
    method: 'link-collector',
    links,
    hostname: location.hostname,
    tabId
  });
}
