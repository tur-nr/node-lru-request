var request = require('request');
var lru = require('lru-cache');
var impl = require('implements');
var hash = require('object-hash');
var debug = require('debug');
var methods = ['get', 'set', 'has', 'del'];

function flush(req, callbacks) {
  var cbs = callbacks.concat();

  callbacks.length = 0;

  cbs.forEach(function(cb) {
    cb(null, req.response, req.response.body);
  });
}

module.exports = function(cache, req) {
  var callbacks = {};

  if (!cache || !impl(cache, methods)) {
    cache = lru(typeof cache === 'object' ? cache : undefined);
  }

  if (typeof req !== 'function') {
    req = request;
  }

  return function lruRequest(uri, opts, cb) {
    var call;
    var key;

    if (arguments.length === 2 && typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    opts = opts || {};

    key = hash({ uri: uri, opts: opts });
    callbacks[key] = callbacks[key] || [];

    if (typeof cb === 'function') {
      callbacks[key].push(cb);
    }

    if (cache.has(key)) {
      call = cache.get(key);

      if (call._ended) {
        process.nextTick(function() {
          flush(call, callbacks[key]);
        });
      }
    } else {
      call = req(uri, opts, function(err, res, body) {
        var code = res.statusCode.toString();

        if (err || !(/^2/).test(code)) {
          cache.del(key, this);
          return cb(err, res, body);
        }

        flush(this, callbacks[key]);
      });

      cache.set(key, call);
    }

    return call;
  };
};
