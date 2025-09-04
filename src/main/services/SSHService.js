const { Client } = require('ssh2');
const fs = require('fs');

class SSHService {
  constructor(connectionConfig) {
    this.config = connectionConfig;
    this.client = new Client();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.client.on('ready', () => {
        resolve();
      }).on('error', (err) => {
        reject(err);
      }).connect(this.config);
    });
  }

  exec(command) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      this.client.exec(command, (err, stream) => {
        if (err) return reject(err);

        stream.on('close', (code, signal) => {
          if (code !== 0) {
            return reject(new Error(`Command failed with code ${code}: ${stderr}`));
          }
          resolve({ stdout, stderr });
        }).on('data', (data) => {
          stdout += data.toString();
        }).stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  end() {
    this.client.end();
  }
}

module.exports = SSHService;