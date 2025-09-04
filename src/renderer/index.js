import Swal from 'sweetalert2';
import * as monaco from 'monaco-editor';
import './styles.css';

document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="sidebar">
            <div class="sidebar-header"><h2>Conexões</h2></div>
            <ul id="connections-list" class="connections-list"></ul>
            <button id="add-new-connection-btn" class="add-btn">+ Nova Conexão</button>
        </div>
        <div class="main-content">
            <div id="file-explorer" class="file-explorer">
                <div class="file-explorer-header">
                    <h3>Explorador de Arquivos</h3>
                    <div id="current-path" class="current-path">/</div>
                </div>
                <ul id="file-list" class="file-list"></ul>
            </div>
            <div class="editor-pane">
                <div class="editor-header">
                    <span id="open-file-name">Nenhum arquivo aberto</span>
                    <button id="save-file-btn" class="action-btn" disabled>Salvar</button>
                </div>
                <div id="editor-container"></div>
            </div>
        </div>
    `;

    const connectionsList = document.getElementById('connections-list');
    const addNewConnectionBtn = document.getElementById('add-new-connection-btn');
    const fileList = document.getElementById('file-list');
    const currentPathEl = document.getElementById('current-path');
    const editorContainer = document.getElementById('editor-container');
    const saveFileBtn = document.getElementById('save-file-btn');
    const openFileNameEl = document.getElementById('open-file-name');

    let currentConnections = [];
    let activeConnectionId = null;
    let currentPath = '/';
    let currentOpenFile = null;
    let editor;

    const swalTheme = { background: '#282c34', color: '#abb2bf', confirmButtonColor: '#2c5364', cancelButtonColor: '#e06c75' };

    // --- Editor Setup ---
    editor = monaco.editor.create(editorContainer, {
        value: '// Selecione um arquivo para editar',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        readOnly: true
    });

    editor.onDidChangeModelContent(() => {
        if (currentOpenFile) saveFileBtn.disabled = false;
    });

    // --- State & UI Management ---
    const updateUIForConnection = (connId) => {
        activeConnectionId = connId;
        currentPath = '/';
        resetEditor();
        renderConnections();
        if (connId) {
            fetchAndRenderFiles(currentPath);
        } else {
            fileList.innerHTML = '<li>Selecione uma conexão para ver os arquivos.</li>';
            currentPathEl.textContent = '/';
        }
    };

    const resetEditor = () => {
        editor.setValue('// Selecione um arquivo para editar');
        editor.updateOptions({ readOnly: true });
        monaco.editor.setModelLanguage(editor.getModel(), 'plaintext');
        openFileNameEl.textContent = 'Nenhum arquivo aberto';
        saveFileBtn.disabled = true;
        currentOpenFile = null;
    };
    
    // --- Data Fetching & Rendering ---
    const renderConnections = () => {
        connectionsList.innerHTML = '';
        currentConnections.forEach(conn => {
            const li = document.createElement('li');
            li.dataset.id = conn.id;
            if (conn.id === activeConnectionId) li.classList.add('active');
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = conn.name;
            nameSpan.title = `${conn.user}@${conn.host}`;
            li.appendChild(nameSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'delete-btn';
            deleteBtn.title = 'Excluir Conexão';
            li.appendChild(deleteBtn);

            li.addEventListener('click', (e) => (e.target !== deleteBtn) && updateUIForConnection(conn.id));
            deleteBtn.addEventListener('click', () => handleDeleteClick(conn));

            connectionsList.appendChild(li);
        });
    };

    const fetchAndRenderFiles = async (path) => {
        if (!activeConnectionId) return;
        currentPathEl.textContent = 'Carregando...';
        fileList.innerHTML = '';
        try {
            const files = await window.ssm.sftpList(activeConnectionId, path);
            currentPath = path;
            currentPathEl.textContent = path;
            
            if (path !== '/') {
                 fileList.innerHTML += `<li class="file-item parent-dir" data-path="${path.substring(0, path.lastIndexOf('/')) || '/'}">..</li>`;
            }

            files.sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name));

            files.forEach(file => {
                const fullPath = (path.endsWith('/') ? path : path + '/') + file.name;
                const icon = file.isDirectory ? '📁' : '📄';
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = `${icon} ${file.name}`;
                li.dataset.path = fullPath;
                li.dataset.type = file.isDirectory ? 'dir' : 'file';
                fileList.appendChild(li);
            });
        } catch (error) {
            Swal.fire({ title: 'Erro SFTP', text: `Não foi possível listar arquivos: ${error.message}`, icon: 'error', ...swalTheme });
            currentPathEl.textContent = 'Erro ao carregar';
        }
    };
    
    // --- Event Handlers ---
    fileList.addEventListener('click', (e) => {
        const li = e.target.closest('li.file-item');
        if (!li) return;
        const path = li.dataset.path;
        if (li.dataset.type === 'dir' || li.classList.contains('parent-dir')) {
            fetchAndRenderFiles(path);
        } else {
            openFile(path);
        }
    });

    const openFile = async (filePath) => {
        openFileNameEl.textContent = 'Carregando...';
        try {
            const content = await window.ssm.sftpReadFile(activeConnectionId, filePath);
            currentOpenFile = filePath;
            editor.setValue(content);
            editor.updateOptions({ readOnly: false });
            openFileNameEl.textContent = filePath;
            const extension = filePath.split('.').pop();
            const language = monaco.languages.getLanguages().find(l => l.extensions?.includes(`.${extension}`))?.id || 'plaintext';
            monaco.editor.setModelLanguage(editor.getModel(), language);
        } catch (error) {
            Swal.fire({ title: 'Erro ao Abrir Arquivo', text: error.message, icon: 'error', ...swalTheme });
            resetEditor();
        }
    };
    
    saveFileBtn.addEventListener('click', async () => {
        if (!currentOpenFile || saveFileBtn.disabled) return;
        const content = editor.getValue();
        Swal.fire({ title: 'Salvando...', text: `Salvando ${currentOpenFile}`, allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...swalTheme });
        try {
            await window.ssm.sftpWriteFile(activeConnectionId, currentOpenFile, content);
            saveFileBtn.disabled = true;
            Swal.fire({ title: 'Salvo!', text: `${currentOpenFile} foi salvo com sucesso.`, icon: 'success', ...swalTheme });
        } catch (error) {
            Swal.fire({ title: 'Erro ao Salvar', text: error.message, icon: 'error', ...swalTheme });
        }
    });
    
    const loadConnections = async () => {
        currentConnections = await window.ssm.listConnections();
        renderConnections();
    };
    
    // --- Connection CRUD Handlers ---
    const handleDeleteClick = (conn) => {
        Swal.fire({ title: 'Confirmar Exclusão', text: `Deseja excluir "${conn.name}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, excluir!', cancelButtonText: 'Cancelar', ...swalTheme })
            .then(async (result) => {
                if (result.isConfirmed) {
                    await window.ssm.removeConnection(conn.id);
                    if (activeConnectionId === conn.id) updateUIForConnection(null);
                    await loadConnections();
                    Swal.fire({ title: 'Excluído!', text: 'Conexão removida.', icon: 'success', ...swalTheme });
                }
            });
    };

    addNewConnectionBtn.addEventListener('click', () => {
        let validatedConnectionData = null;

        Swal.fire({
            title: 'Nova Conexão',
            html: `
                <form id="swal-connection-form" class="swal-form">
                    <div class="swal-form-group">
                        <label for="swal-name">Nome</label>
                        <input id="swal-name" name="name" class="swal2-input" placeholder="Meu Servidor Web" required>
                    </div>
                    <div class="swal-form-group">
                        <label for="swal-host">Host</label>
                        <input id="swal-host" name="host" class="swal2-input" placeholder="192.168.1.100" required>
                    </div>
                    <div class="swal-form-group">
                        <label for="swal-user">Usuário</label>
                        <input id="swal-user" name="user" class="swal2-input" placeholder="root" required>
                    </div>
                    <div class="swal-form-group">
                        <label for="swal-authMethod">Autenticação</label>
                        <select id="swal-authMethod" name="authMethod" class="swal2-select">
                            <option value="password">Senha</option>
                            <option value="key">Chave Privada</option>
                        </select>
                    </div>
                    <div id="swal-password-group" class="swal-form-group">
                        <label for="swal-password">Senha</label>
                        <input type="password" id="swal-password" name="password" class="swal2-input">
                    </div>
                    <div id="swal-key-path-group" class="swal-form-group" style="display: none;">
                        <label for="swal-keyPath">Caminho da Chave</label>
                        <input id="swal-keyPath" name="keyPath" class="swal2-input" placeholder="C:\\Users\\...\\.ssh\\id_rsa">
                    </div>
                </form>
            `,
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Testar Conexão',
            showLoaderOnConfirm: true,
            customClass: {
                popup: 'swal-wide',
            },
            ...swalTheme,
            didOpen: () => {
                const form = document.getElementById('swal-connection-form');
                const authSelect = document.getElementById('swal-authMethod');
                const passwordGroup = document.getElementById('swal-password-group');
                const keyPathGroup = document.getElementById('swal-key-path-group');

                const toggleAuthFields = () => {
                    if (authSelect.value === 'key') {
                        passwordGroup.style.display = 'none';
                        keyPathGroup.style.display = 'flex';
                    } else {
                        passwordGroup.style.display = 'flex';
                        keyPathGroup.style.display = 'none';
                    }
                };
                authSelect.addEventListener('change', toggleAuthFields);

                form.addEventListener('input', () => {
                    Swal.getConfirmButton().textContent = 'Testar Conexão';
                    Swal.disableButtons();
                    Swal.enableConfirmButton();
                    validatedConnectionData = null;
                });
            },
            preConfirm: async () => {
                const form = document.getElementById('swal-connection-form');
                const formData = new FormData(form);
                const connData = Object.fromEntries(formData.entries());

                if (!connData.name || !connData.host || !connData.user) {
                    Swal.showValidationMessage('Nome, Host e Usuário são obrigatórios');
                    return false;
                }
                
                try {
                    await window.ssm.testConnection(connData);
                    validatedConnectionData = connData;
                    return true;
                } catch (error) {
                    Swal.showValidationMessage(`Falha na conexão: ${error.message}`);
                    return false;
                }
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (!validatedConnectionData) return;
                try {
                    const { password, ...dataToSave } = validatedConnectionData;
                    const newConnection = await window.ssm.addConnection(dataToSave);
                    if (dataToSave.authMethod === 'password' && password) {
                        await window.ssm.setPassword(newConnection.id, password);
                    }
                    await loadConnections();
                    Swal.fire({ title: 'Salvo!', text: 'Conexão adicionada com sucesso.', icon: 'success', ...swalTheme });
                } catch (error) {
                    Swal.fire({ title: 'Erro ao Salvar', text: 'Não foi possível salvar a conexão.', icon: 'error', ...swalTheme });
                }
            }
        });
    });

    // Initial Load
    loadConnections();
    updateUIForConnection(null);
});