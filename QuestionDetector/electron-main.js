// Bootstrap: ensure Electron runs as browser, not Node.
delete process.env.ELECTRON_RUN_AS_NODE;
require('./dist-electron/main.js');

