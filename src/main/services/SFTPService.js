const { Client } = require('ssh2');

class SFTPService {
    constructor(sshConfig) {
        this.sshConfig = sshConfig;
        this.client = new Client();
        this.sftp = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                this.client.sftp((err, sftp) => {
                    if (err) {
                        return reject(err);
                    }
                    this.sftp = sftp;
                    resolve();
                });
            }).on('error', (err) => {
                reject(err);
            }).connect(this.sshConfig);
        });
    }

    list(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.readdir(remotePath, (err, list) => {
                if (err) {
                    return reject(err);
                }
                const files = list.map(item => ({
                    name: item.filename,
                    isDirectory: item.longname.startsWith('d'),
                    isFile: item.longname.startsWith('-'),
                    size: item.attrs.size,
                    modified: new Date(item.attrs.mtime * 1000)
                }));
                resolve(files);
            });
        });
    }

    readFile(remotePath) {
        return new Promise((resolve, reject) => {
            const stream = this.sftp.createReadStream(remotePath);
            let data = '';
            stream.on('data', (chunk) => {
                data += chunk.toString('utf8');
            });
            stream.on('end', () => {
                resolve(data);
            });
            stream.on('error', (err) => {
                reject(err);
            });
        });
    }

    writeFile(remotePath, content) {
        return new Promise((resolve, reject) => {
            const stream = this.sftp.createWriteStream(remotePath);
            stream.on('finish', () => {
                resolve();
            });
            stream.on('error', (err) => {
                reject(err);
            });
            stream.end(content, 'utf8');
        });
    }

    disconnect() {
        if (this.sftp) {
            this.sftp.end();
            this.sftp = null;
        }
        this.client.end();
    }
}

module.exports = SFTPService;