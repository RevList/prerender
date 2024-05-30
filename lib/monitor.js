const { spawn } = require('child_process');

let yourCommand;

function startAndMonitorProcess() {
  console.log('Starting and monitoring process');

  if (yourCommand) {
    yourCommand.stdout.removeAllListeners('data');
    yourCommand.stderr.removeAllListeners('data');
    yourCommand.kill();
  }

  yourCommand = spawn('node', ['server.js']);

  yourCommand.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
    if (data.includes('Timed out waiting for Chrome connection')) {
      console.log("Error detected! Restarting...");
      startAndMonitorProcess();
    }
  });

  yourCommand.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  yourCommand.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });
}

startAndMonitorProcess();cur