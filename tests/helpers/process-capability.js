'use strict';

const childProcess = require('child_process');

// Only a denied SPAWN counts as a missing capability. Node tags spawn failures with
// syscall 'spawn <cmd>'; filesystem failures carry the same EPERM/EACCES codes but a
// different syscall. Without the syscall check, an EPERM thrown by fs.rmSync during temp
// cleanup on Windows would be reported as "process spawn not permitted" and a genuine
// failure would be filed as a skip.
function processSpawnDenied(error) {
  return !!error && ['EPERM', 'EACCES'].includes(error.code) &&
    typeof error.syscall === 'string' && error.syscall.startsWith('spawn');
}

function probeProcessSpawn() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child;
    try {
      child = childProcess.spawn(process.execPath, ['-e', ''], {
        stdio: 'ignore', windowsHide: true
      });
    } catch (error) {
      if (processSpawnDenied(error)) resolve({ available: false });
      else reject(error);
      return;
    }
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      reject(new Error('process_spawn_probe_timeout'));
    }, 5000);
    child.once('spawn', () => {
      child.kill();
      finish({ available: true });
    });
    child.once('error', (error) => {
      if (processSpawnDenied(error)) finish({ available: false });
      else {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

module.exports = { processSpawnDenied, probeProcessSpawn };
