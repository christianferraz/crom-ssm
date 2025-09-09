import { randomUUID } from 'crypto';

class SnippetModel {
  constructor({ id, name, command }) {
    this.id = id || randomUUID();
    this.name = name;
    this.command = command;
  }
}

export default SnippetModel;