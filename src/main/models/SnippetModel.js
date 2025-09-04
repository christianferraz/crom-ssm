const crypto = require('crypto');

class SnippetModel {
  constructor({ id, name, command }) {
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.command = command;
  }
}

module.exports = SnippetModel;