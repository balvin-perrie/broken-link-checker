'use strict';

var args = new URLSearchParams(location.search);

document.addEventListener('click', e => {
  const {cmd} = e.target.dataset;
  if (cmd === 'close' && window.top !== window) {
    chrome.runtime.sendMessage({
      method: 'close-me'
    });
  }
  else if (cmd === 'close') {
    window.close();
  }
  else if (cmd === 'inspect') {
    const tr = e.target.closest('tr');
    chrome.runtime.sendMessage({
      method: 'inspect',
      link: tr.dataset.link,
      hostname: tr.dataset.hostname,
      color: tr.dataset.color,
      bg: tr.dataset.bg,
      tabId: Number(args.get('tabId'))
    });
  }
  else if (cmd === 'reload') {
    location.reload();
  }
  else if (cmd === 'abort') {
    schedule.links = [];
  }
});

var cache = {};

var ui = {};
{
  const stat = document.getElementById('stat');
  const progress = document.getElementById('progress');
  const valids = document.getElementById('valid-counter');
  const brokens = document.getElementById('broken-counter');
  ui.update = () => {
    valids.textContent = schedule.valids;
    brokens.textContent = schedule.brokens;
    const len = schedule.brokens + schedule.valids;
    const total = Object.keys(cache).length;
    stat.textContent = `${len}/${total}`;
    progress.max = total;
    progress.value = len;
  };
}
{
  ui.append = {};
  const tr = document.getElementById('tr');
  const map = {
    '0': 'No Access-Control-Allow-Origin',
    '100': 'Continue',
    '101': 'Switching Protocol',
    '102': 'Processing',
    '103': 'Early Hints',
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '207': 'Multi-Status',
    '208': 'Multi-Status',
    '226': 'IM Used',
    '300': 'Multiple Choice',
    '3XX': 'Permanent or Temporary Redirect',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '306': 'unused',
    '307': 'Temporary Redirect',
    '308': 'Permanent Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Failed',
    '413': 'Payload Too Large',
    '414': 'URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Requested Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': 'I\'m a teapot',
    '421': 'Misdirected Request',
    '422': 'Unprocessable Entity',
    '423': 'Locked',
    '424': 'Failed Dependency',
    '425': 'Too Early',
    '426': 'Upgrade Required',
    '428': 'Precondition Required',
    '429': 'Too Many Requests',
    '431': 'Request Header Fields Too Large',
    '451': 'Unavailable For Legal Reasons',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported',
    '506': 'Variant Also Negotiates',
    '507': 'Insufficient Storage',
    '508': 'Loop Detected',
    '510': 'Not Extended',
    '511': 'Network Authentication Required'
  };
  ui.append.add = (result, kind) => {
    schedule[kind + 's'] += 1;
    const clone = document.importNode(tr.content, true);
    const [status, msg, link, hostname] = [...clone.querySelectorAll('td')];
    if (result.status === 200 && result.responseURL !== result.link) {
      result.status = '3XX';
    }
    status.title = status.textContent = result.status;
    link.title = link.textContent = result.link +
      (!result.responseURL || result.responseURL === result.link ? '' : ' -> ' + result.responseURL);
    msg.title = msg.textContent = map[result.status] || 'unknown';
    hostname.title = hostname.textContent = result.hostname;
    Object.assign(clone.querySelector('tr').dataset, {
      link: result.link,
      hostname: result.hostname,
      bg: kind === 'valid' ? 'green' : 'red',
      color: 'white'
    });
    document.querySelector(`#${kind}s tbody`).appendChild(clone);
  };
  ui.append.valid = result => ui.append.add(result, 'valid');
  ui.append.broken = result => ui.append.add(result, 'broken');
}

var schedule = {
  links: [],
  busy: false,
  brokens: 0,
  valids: 0
};
schedule.fetch = ({link, hostname}) => new Promise(resolve => chrome.runtime.sendMessage({
  method: 'fetch',
  link
}, r => resolve(Object.assign({
  link,
  hostname
}, r))));
schedule.step = () => {
  if (schedule.busy || schedule.links.length === 0) {
    return;
  }
  schedule.busy = true;
  Promise.all([
    schedule.links.shift(),
    schedule.links.shift(),
    schedule.links.shift(),
    schedule.links.shift(),
    schedule.links.shift()
  ].filter(a => a).map(schedule.fetch)).then(results => {
    const v = document.getElementById('valids');
    const b = document.getElementById('brokens');

    for (const result of results) {
      if ((result.status >= 200 && result.status < 400) || result.status === 0) {
        const doScroll = v.scrollHeight - v.scrollTop === v.clientHeight;
        console.log(v.scrollTop, v.scrollHeight);
        ui.append.valid(result);
        if (doScroll) {
          v.scrollTop = v.scrollHeight;
        }
      }
      else {
        ui.append.broken(result);
        const doScroll = b.scrollHeight - b.scrollTop === b.clientHeight;
        if (doScroll) {
          b.scrollTop = b.scrollHeight;
        }
      }
    }
    ui.update();
    schedule.busy = false;
    if (schedule.links.length) {
      schedule.step();
    }
    else {
      document.body.dataset.done = true;
    }
  });
};
schedule.append = (links, hostname) => {
  document.body.dataset.done = false;
  links.forEach(link => {
    schedule.links.push({
      link,
      hostname
    });
  });
  schedule.step();
};

chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'link-collector-bounced') {
    const newLinks = [];
    for (const link of request.links) {
      if (cache[link] === undefined && link.startsWith('http')) {
        cache[link] = true;
        newLinks.push(link);
      }
    }
    ui.update();
    schedule.append(newLinks, request.hostname);
  }
});
chrome.runtime.sendMessage({
  method: 'self-id'
}, selfId => {
  chrome.runtime.sendMessage({
    method: 'grab-links',
    allFrames: document.getElementById('allFrames').value === 'true',
    matchAboutBlank: document.getElementById('matchAboutBlank').value === 'true',
    tabId: Number(args.get('tabId')),
    selfId
  });
});

/* persist */
document.addEventListener('change', e => {
  if (e.target.id) {
    localStorage.setItem(e.target.id, e.target.value);
  }
});
for (const key of Object.keys(localStorage)) {
  const e = document.getElementById(key);
  if (e) {
    e.value = localStorage.getItem(key);
  }
}
