import { app } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import keytar from 'keytar';


import { join } from 'path';
import ConnectionModel from '../models/ConnectionModel.js';

const { getPassword: _getPassword, setPassword: _setPassword, deletePassword } = keytar;
const APP_NAME = 'ssm';
const STORAGE_FILE = join(app.getPath('userData'), 'connections.json');

class ConnectionService {
  constructor() {
    this.connections = [];
  }

  async _loadConnectionsFromFile() {
    try {
      const data = await readFile(STORAGE_FILE, 'utf-8');
      const rawConnections = JSON.parse(data);
      this.connections = rawConnections.map(c => new ConnectionModel(c));
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.connections = [];
        await this._saveConnectionsToFile();
      } else {
        console.error('Failed to load connections:', error);
      }
    }
    return this.connections;
  }

  async _saveConnectionsToFile() {
    try {
      await writeFile(STORAGE_FILE, JSON.stringify(this.connections, null, 2));
    } catch (error) {
      console.error('Failed to save connections:', error);
    }
  }

  async list() {
    return await this._loadConnectionsFromFile();
  }

  async get(id) {
    await this._loadConnectionsFromFile();
    return this.connections.find(c => c.id === id);
  }

  async add(connectionData) {
    await this._loadConnectionsFromFile();
    const newConnection = new ConnectionModel(connectionData);
    this.connections.push(newConnection);
    await this._saveConnectionsToFile();
    return newConnection;
  }

  async update(id, data) {
    await this._loadConnectionsFromFile();
    const index = this.connections.findIndex(c => c.id === id);
    if (index !== -1) {
      this.connections[index] = new ConnectionModel({ ...this.connections[index], ...data });
      await this._saveConnectionsToFile();
      return this.connections[index];
    }
    return null;
  }

  async remove(id) {
    await this._loadConnectionsFromFile();
    this.connections = this.connections.filter(c => c.id !== id);
    await this._saveConnectionsToFile();
    await deletePassword(APP_NAME, id);
    return true;
  }

  async setPassword(connectionId, password) {
    return _setPassword(APP_NAME, connectionId, password);
  }

  async getPassword(connectionId) {
    return _getPassword(APP_NAME, connectionId);
  }
}

export default new ConnectionService();