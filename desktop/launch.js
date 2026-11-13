const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { cwd: __dirname, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
