"use strict";

/* eslint-env browser */

/*
  eslint-disable
  no-console,
  func-names
*/
var normalizeUrl = require('./normalize-url');

var srcByModuleId = Object.create(null);
var noDocument = typeof document === 'undefined';
var forEach = Array.prototype.forEach;

function debounce(fn, time) {
  var timeout = 0;
  return function () {
    var self = this; // eslint-disable-next-line prefer-rest-params

    var args = arguments;

    var functionCall = function functionCall() {
      return fn.apply(self, args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(functionCall, time);
  };
}

function noop() { }

function fetchDataSync(url) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false); // false 表示同步请求
  xhr.send(null);

  if (xhr.status === 200) {
    return JSON.parse(xhr.responseText);
  } else {
    throw new Error(`Request failed with status ${xhr.status}`);
  }
}
let map = {}
if (window.microApp) {
  const { fePort, https } = window.ssrDevInfo;
  const href = `${https ? 'https' : 'http'}://127.0.0.1:${fePort}/chunkMap.json`
  map = fetchDataSync(href)
}

function getCurrentScriptUrl(moduleId) {
  var src = srcByModuleId[moduleId];
  if (window.microApp && !src) {
    var fileName = moduleId.split('!').at(-1)
    src = map[fileName]
    srcByModuleId[moduleId] = src
  } else if (!src) {
    if (document.currentScript) {
      src = document.currentScript.src;
    } else {
      var scripts = document.getElementsByTagName('script');
      var lastScriptTag = scripts[scripts.length - 1];

      if (lastScriptTag) {
        src = lastScriptTag.src;
      }
    }

    srcByModuleId[moduleId] = src;
  }

  return function (fileMap) {
    if (!src) {
      return null;
    }

    var splitResult = src.split(/([^\\/]+)\.js$/);
    var filename = splitResult && splitResult[1];

    if (!filename) {
      return [src.replace('.js', '.css')];
    }

    if (!fileMap) {
      return [src.replace('.js', '.css')];
    }

    return fileMap.split(',').map(function (mapRule) {
      var reg = new RegExp("".concat(filename, "\\.js$"), 'g');
      return normalizeUrl(src.replace(reg, "".concat(mapRule.replace(/{fileName}/g, filename), ".css")));
    });
  };
}

function updateCss(el, url) {
  if (!url) {
    if (!el.href) {
      return;
    } // eslint-disable-next-line


    url = el.href.split('?')[0];
  }

  if (!isUrlRequest(url)) {
    return;
  }

  if (el.isLoaded === false) {
    // We seem to be about to replace a css link that hasn't loaded yet.
    // We're probably changing the same file more than once.
    return;
  }

  if (!url || !(url.indexOf('.css') > -1)) {
    return;
  } // eslint-disable-next-line no-param-reassign


  el.visited = true;
  var newEl = el.cloneNode();
  newEl.isLoaded = false;
  newEl.addEventListener('load', function () {
    if (newEl.isLoaded) {
      return;
    }

    newEl.isLoaded = true;
    el.parentNode.removeChild(el);
  });
  newEl.addEventListener('error', function () {
    if (newEl.isLoaded) {
      return;
    }

    newEl.isLoaded = true;
    el.parentNode.removeChild(el);
  });
  newEl.href = "".concat(url, "?").concat(Date.now());

  if (el.nextSibling) {
    el.parentNode.insertBefore(newEl, el.nextSibling);
  } else {
    el.parentNode.appendChild(newEl);
  }
}

function getReloadUrl(href, src) {
  var ret; // eslint-disable-next-line no-param-reassign

  href = normalizeUrl(href, {
    stripWWW: false
  }); // eslint-disable-next-line array-callback-return

  src.some(function (url) {
    if (href.indexOf(src) > -1) {
      ret = url;
    }
  });
  return ret;
}

function reloadStyle(src) {
  if (!src) {
    return false;
  }

  var elements = document.querySelectorAll('link');
  var loaded = false;
  forEach.call(elements, function (el) {
    if (!el.href) {
      return;
    }

    var url = getReloadUrl(el.href, src);

    if (!isUrlRequest(url)) {
      return;
    }

    if (el.visited === true) {
      return;
    }

    if (url) {
      updateCss(el, url);
      loaded = true;
    }
  });
  return loaded;
}

function reloadAll() {
  var elements = document.querySelectorAll('link');
  forEach.call(elements, function (el) {
    if (el.visited === true) {
      return;
    }

    updateCss(el);
  });
}

function isUrlRequest(url) {
  // An URL is not an request if
  // It is not http or https
  if (!/^https?:/i.test(url)) {
    return false;
  }

  return true;
}

module.exports = function (moduleId, options) {
  if (noDocument) {
    console.log('no window.document found, will not HMR CSS');
    return noop;
  }

  var getScriptSrc = getCurrentScriptUrl(moduleId);

  function update() {
    if (window.microApp) {
      const src = getScriptSrc(options.filename);
      const { manifest, fePort, https } = window.ssrDevInfo;
      src.map(item => item.startsWith('http') ? item : manifest[item + '.css'])
        .forEach(item => {
          console.log('[HMR] css reload %s', item);
          const link = document.createElement('link');
          const href = item.startsWith('http') ? `${item}?${Date.now()}` : `${https ? 'https' : 'http'}://127.0.0.1:${fePort}${item}?${Date.now()}`
          link.href = href
          link.rel = 'stylesheet';
          link.type = 'text/css';
          document.head.appendChild(link);
        });
    } else {
      var src = getScriptSrc(options.filename);

      var reloaded = reloadStyle(src);

      if (options.locals) {
        console.log('[HMR] Detected local css modules. Reload all css');
        reloadAll();
        return;
      }

      if (reloaded) {
        console.log('[HMR] css reload %s', src.join(' '));
      } else {
        console.log('[HMR] Reload all css');
        reloadAll();
      }
    }
  }

  return debounce(update, 50);
};