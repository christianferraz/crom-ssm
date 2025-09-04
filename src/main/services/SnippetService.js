const { app } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const SnippetModel = require('../models/SnippetModel');

const STORAGE_FILE = path.join(app.getPath('userData'), 'snippets.json');

class SnippetService {
  constructor() {
    this.snippets = [];
  }

  async _loadSnippetsFromFile() {
    try {
      const data = await fs.readFile(STORAGE_FILE, 'utf-8');
      const rawSnippets = JSON.parse(data);
      this.snippets = rawSnippets.map(s => new SnippetModel(s));
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.snippets = [];
        await this._saveSnippetsToFile();
      } else {
        console.error('Failed to load snippets:', error);
      }
    }
    return this.snippets;
  }

  async _saveSnippetsToFile() {
    try {
      await fs.writeFile(STORAGE_FILE, JSON.stringify(this.snippets, null, 2));
    } catch (error) {
      console.error('Failed to save snippets:', error);
    }
  }

  async list() {
    return await this._loadSnippetsFromFile();
  }

  async add(snippetData) {
    await this._loadSnippetsFromFile();
    const newSnippet = new SnippetModel(snippetData);
    this.snippets.push(newSnippet);
    await this._saveSnippetsToFile();
    return newSnippet;
  }

  async update(snippetData) {
    await this._loadSnippetsFromFile();
    const index = this.snippets.findIndex(s => s.id === snippetData.id);
    if (index !== -1) {
      this.snippets[index] = new SnippetModel(snippetData);
      await this._saveSnippetsToFile();
      return this.snippets[index];
    }
    return null;
  }

  async remove(id) {
    await this._loadSnippetsFromFile();
    this.snippets = this.snippets.filter(s => s.id !== id);
    await this._saveSnippetsToFile();
    return true;
  }
}

module.exports = new SnippetService();