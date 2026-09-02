#!/usr/bin/env node
const { spawn } = require('node:child_process');

const extraArgs = process.argv.slice(2).join(' ');
const cmd = `npx expo start ${extraArgs}`;
const child = spawn(cmd, [], { cwd: __dirname, stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
