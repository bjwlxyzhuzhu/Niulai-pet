'use strict';
/* API key 的存取。

   用 Electron 的 safeStorage —— 在 Windows 上它背后是 DPAPI，
   密文和当前 Windows 账户绑定，别的账户或别的机器拿到配置文件也解不开。
   极少数环境下系统加密不可用，那时降级为明文存，但会如实标注出来，
   由设置界面提示你，而不是假装安全。 */

const { safeStorage } = require('electron');

function seal(plain) {
  if (!plain) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, v: safeStorage.encryptString(plain).toString('base64') };
  }
  return { enc: false, v: plain };
}

function open(stored) {
  if (!stored || !stored.v) return '';
  if (!stored.enc) return stored.v;
  try {
    return safeStorage.decryptString(Buffer.from(stored.v, 'base64'));
  } catch (_) {
    return '';    // 换了账户或换了机器，解不开就当没配
  }
}

function available() {
  return safeStorage.isEncryptionAvailable();
}

/** 只给界面看的遮罩，永远不把完整 key 送回渲染层 */
function mask(plain) {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return plain.slice(0, 3) + '••••••••' + plain.slice(-4);
}

module.exports = { seal, open, available, mask };
