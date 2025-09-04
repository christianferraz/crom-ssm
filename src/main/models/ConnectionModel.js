const crypto = require('crypto');

class ConnectionModel {
  constructor({ id, name, host, port = 22, user, authMethod = 'key', keyPath = null, lastSeen = null }) {
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.host = host;
    this.port = port;
    this.user = user;
    this.authMethod = authMethod; // 'key' or 'password'
    this.keyPath = keyPath;
    this.lastSeen = lastSeen;
  }
}

module.exports = ConnectionModel;