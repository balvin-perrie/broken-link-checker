'use strict';
({
  links: [...document.querySelectorAll('a')].map(a => a.href).filter(s => s),
  origin: location.href
})
