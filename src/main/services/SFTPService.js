const { Client } = require('ssh2');
const fs = require('fs');

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
                    if (err) return reject(err);
                    this.sftp = sftp;
                    resolve();
                });
            }).on('error', (err) => reject(err)).connect(this.sshConfig);
        });
    }

    list(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.readdir(remotePath, (err, list) => {
                if (err) return reject(err);
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

    readFile(remotePath, encoding = 'utf8') {
        return new Promise((resolve, reject) => {
            const stream = this.sftp.createReadStream(remotePath);
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
            stream.on('error', (err) => reject(err));
        });
    }

    writeFile(remotePath, content) {
        return new Promise((resolve, reject) => {
            const stream = this.sftp.createWriteStream(remotePath);
            stream.on('finish', () => resolve());
            stream.on('error', (err) => reject(err));
            stream.end(content, 'utf8');
        });
    }

    deleteFile(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.unlink(remotePath, (err) => err ? reject(err) : resolve());
        });
    }

    deleteDir(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.rmdir(remotePath, (err) => err ? reject(err) : resolve());
        });
    }

    createDir(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.mkdir(remotePath, (err) => err ? reject(err) : resolve());
        });
    }

    rename(oldPath, newPath) {
        return new Promise((resolve, reject) => {
            this.sftp.rename(oldPath, newPath, (err) => err ? reject(err) : resolve());
        });
    }
    
    downloadFile(remotePath, localPath) {
        return new Promise((resolve, reject) => {
            this.sftp.fastGet(remotePath, localPath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    uploadFile(localPath, remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.fastPut(localPath, remotePath, (err) => {
                if (err) return reject(err);
                resolve();
            });
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