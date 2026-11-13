/* Storage capability client for generated apps served from an app origin. */
(function () {
  window.nexlOS = window.nexlOS || {}
  var seq = 0
  var waiters = {}
  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || data.__nexlAppDataResult !== true || !waiters[data.requestId]) return
    var waiter = waiters[data.requestId]
    delete waiters[data.requestId]
    if (data.ok) waiter.resolve(data.value)
    else waiter.reject(new Error(data.error || 'app storage error'))
  })
  function call(op, key, value) {
    return new Promise(function (resolve, reject) {
      var requestId = String(++seq)
      waiters[requestId] = { resolve: resolve, reject: reject }
      try { parent.postMessage({ __nexlAppData: true, requestId: requestId, op: op, key: key, value: value }, '*') }
      catch (error) { delete waiters[requestId]; reject(error) }
      setTimeout(function () {
        if (waiters[requestId]) { delete waiters[requestId]; reject(new Error('app storage timeout')) }
      }, 8000)
    })
  }
  window.nexlOS.storage = {
    get: function (key) { return call('get', key) },
    set: function (key, value) { return call('set', key, value) },
    remove: function (key) { return call('remove', key) },
    clear: function () { return call('clear') },
  }
})()
