import { randomUUID } from 'crypto';

class ConnectionModel {
  constructor({ id, name, host, port = 22, user, authMethod = 'key', keyPath = null, lastSeen = null, monitoredServices = [] }) {
    this.id = id || randomUUID();
    this.name = name;
    this.host = host;
    this.port = port;
    this.user = user;
    this.authMethod = authMethod; // 'key' or 'password'
    this.keyPath = keyPath;
    this.lastSeen = lastSeen;
    this.monitoredServices = monitoredServices;
  }
}

export default ConnectionModel;