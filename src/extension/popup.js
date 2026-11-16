document.getElementById('connect').addEventListener('click', () => {
  const token = document.getElementById('token').value.trim()
  chrome.storage.local.set({ token }, () => {
    chrome.runtime.sendMessage({ type: 'connect', token }, (response) => {
      document.getElementById('status').textContent = response && response.ok ? '已连接，等待 NexlOS 配对' : '连接失败'
    })
  })
})
document.getElementById('open').addEventListener('click', () => {
  const url = document.getElementById('url').value.trim()
  chrome.tabs.create({ url, active: true }, (tab) => {
    chrome.runtime.sendMessage({ type: 'start-capture', tabId: tab.id }, (response) => {
      document.getElementById('status').textContent = response && response.ok ? '已开始捕获 tab' : String((response && response.error) || 'capture failed')
    })
  })
})
chrome.storage.local.get(['token'], v => { if (v.token) document.getElementById('token').value = v.token })
