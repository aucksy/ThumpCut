/* Dev-time loader for cards & UI kits: fetches component .jsx sources, strips
   import/export, transpiles once with Babel standalone, exposes window.TC.
   Usage: TCLoad('..', ['components/ruler/BeatRuler.jsx', ...]).then(TC => ...) */
window.TCLoad = function (base, files) {
  return Promise.all(
    files.map(function (f) { return fetch(base + '/' + f + '?v=' + (window.TCV || 1)).then(function (r) { return r.text(); }); })
  ).then(function (srcs) {
    var code = srcs.join('\n')
      .replace(/^\s*import[^\n]*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, '')
      .replace(/^\s*export\s+/gm, '');
    var out = Babel.transform(code, { presets: ['react'] }).code;
    var names = [];
    var re = /(?:^|\n)(?:function|const)\s+([A-Z]\w*)/g, m;
    while ((m = re.exec(code))) names.push(m[1]);
    names = names.filter(function (n, i) { return names.indexOf(n) === i; });
    var fn = new Function('React', out + ';\nreturn {' + names.join(',') + '};');
    window.TC = Object.assign(window.TC || {}, fn(React));
    return window.TC;
  });
};
