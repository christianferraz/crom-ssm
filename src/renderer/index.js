import Swal from 'sweetalert2';
import * as monaco from 'monaco-editor';
import { Chart, registerables } from 'chart.js';
import './styles.css';

Chart.register(...registerables);

document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="sidebar">
            <div class="sidebar-header"><h2>Conexões</h2></div>
            <ul id="connections-list" class="connections-list"></ul>
            <button id="add-new-connection-btn" class="add-btn">+ Nova Conexão</button>
        </div>
        <div class="main-content">
            <div class="tabs">
                <button class="tab-link active" data-tab="dashboard">Dashboard</button>
                <button class="tab-link" data-tab="files">Arquivos</button>
            </div>
            <div id="dashboard" class="tab-content active">
                <div id="dashboard-welcome">Selecione uma conexão para ver as métricas.</div>
                <div id="dashboard-content" class="dashboard-grid" style="display: none;">
                    <div class="card"><div class="card-header">CPU</div><div class="card-body"><canvas id="cpuChart"></canvas><p id="cpu-text">--%</p></div></div>
                    <div class="card"><div class="card-header">Memória</div><div class="card-body"><canvas id="memChart"></canvas><p id="mem-text">-- / -- MB</p></div></div>
                    <div class="card"><div class="card-header">Disco (/)</div><div class="card-body"><canvas id="diskChart"></canvas><p id="disk-text">-- / --</p></div></div>
                    <div class="card uptime-card"><div class="card-header">Uptime</div><div class="card-body" id="uptime-text">--</div></div>
                </div>
            </div>
            <div id="files" class="tab-content">
                 <div id="file-explorer" class="file-explorer">
                    <div class="file-explorer-header"><h3>Explorador</h3><div id="current-path" class="current-path">/</div></div>
                    <ul id="file-list" class="file-list"></ul>
                </div>
                <div class="editor-pane">
                    <div id="editor-view" class="view"><div class="editor-header"><span id="open-file-name"></span><button id="save-file-btn" class="action-btn" disabled>Salvar</button></div><div id="editor-container"></div></div>
                    <div id="media-view" class="view media-viewer" style="display: none;"></div>
                </div>
            </div>
        </div>
        <div id="context-menu" class="context-menu"></div>
    `;

    // --- Element Selectors ---
    const connectionsList = document.getElementById('connections-list');
    const addNewConnectionBtn = document.getElementById('add-new-connection-btn');
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const fileExplorer = document.getElementById('file-explorer');
    const fileList = document.getElementById('file-list');
    const currentPathEl = document.getElementById('current-path');
    const editorContainer = document.getElementById('editor-container');
    const saveFileBtn = document.getElementById('save-file-btn');
    const openFileNameEl = document.getElementById('open-file-name');
    const contextMenu = document.getElementById('context-menu');
    const editorView = document.getElementById('editor-view');
    const mediaView = document.getElementById('media-view');
    const dashboardWelcome = document.getElementById('dashboard-welcome');
    const dashboardContent = document.getElementById('dashboard-content');
    const uptimeText = document.getElementById('uptime-text');
    const cpuText = document.getElementById('cpu-text');
    const memText = document.getElementById('mem-text');
    const diskText = document.getElementById('disk-text');
    let cpuChart, memChart, diskChart;

    // --- State Variables ---
    let currentConnections = [];
    let activeConnectionId = null;
    let currentPath = '/';
    let currentOpenFile = null;
    let editor;
    let cleanupMetricsListener = null;

    // --- Constants ---
    const swalTheme = { background: '#282c34', color: '#abb2bf', confirmButtonColor: '#2c5364', cancelButtonColor: '#e06c75' };
    const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'ico'];
    const BINARY_EXTENSIONS = [
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'ico', 'bmp', 'tif', 'tiff', 'mov', 'avi', 'mkv',
      'mp3', 'wav', 'flac', 'aac',
      'woff', 'woff2', 'ttf', 'eot', 'otf',
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dll', 'so', 'a', 'lib', 'jar', 'war', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'iso', 'dmg', 'bin'
    ];

    // --- Chart Setup ---
    const createChart = (ctx, type, data) => new Chart(ctx, { type, data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    
    const initCharts = () => {
        if (cpuChart) cpuChart.destroy();
        if (memChart) memChart.destroy();
        if (diskChart) diskChart.destroy();
        cpuChart = createChart(document.getElementById('cpuChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#61afef', '#3a3f4b'], borderWidth: 0 }] });
        memChart = createChart(document.getElementById('memChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#98c379', '#3a3f4b'], borderWidth: 0 }] });
        diskChart = createChart(document.getElementById('diskChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#e06c75', '#3a3f4b'], borderWidth: 0 }] });
    };

    // --- Editor Setup ---
    editor = monaco.editor.create(editorContainer, {
        value: '// Selecione um arquivo para editar', language: 'plaintext', theme: 'vs-dark', automaticLayout: true, readOnly: true
    });
    editor.onDidChangeModelContent(() => { if (currentOpenFile) saveFileBtn.disabled = false; });
    
    // --- UI & View Management ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tab.dataset.tab) {
                    content.classList.add('active');
                }
            });
        });
    });

    const updateUIForConnection = (connId) => {
        activeConnectionId = connId;
        renderConnections();

        if (cleanupMetricsListener) {
            cleanupMetricsListener();
            cleanupMetricsListener = null;
        }

        if (activeConnectionId) {
            window.ssm.startMetrics(activeConnectionId);
            dashboardWelcome.style.display = 'none';
            dashboardContent.style.display = 'grid';
            initCharts();
            cleanupMetricsListener = window.ssm.onMetricsUpdate(updateDashboard);
        } else {
            window.ssm.stopMetrics(null); // Stop any active polling
            dashboardWelcome.style.display = 'block';
            dashboardContent.style.display = 'none';
        }
        
        currentPath = '/';
        resetPanes();
        fileList.innerHTML = connId ? '' : '<li>Selecione uma conexão para ver os arquivos.</li>';
        currentPathEl.textContent = '/';
        if (connId) fetchAndRenderFiles('/');
    };
    
    const updateDashboard = (metrics) => {
        if (!activeConnectionId) return;
        if (metrics.status === 'error') {
            uptimeText.textContent = `Erro ao carregar: ${metrics.message}`;
            return;
        }
        const { uptime, memory, disk, cpu } = metrics.data;
        uptimeText.textContent = uptime;
        cpuText.textContent = `${cpu}%`;
        memText.textContent = `${memory.used} / ${memory.total} MB`;
        diskText.textContent = `${disk.used} / ${disk.total} (${disk.percent})`;

        cpuChart.data.datasets[0].data = [cpu, 100 - cpu];
        cpuChart.update('none');
        memChart.data.datasets[0].data = [memory.used, memory.free];
        memChart.update('none');
        const diskPercent = parseInt(disk.percent.replace('%', ''));
        diskChart.data.datasets[0].data = [diskPercent, 100 - diskPercent];
        diskChart.update('none');
    };
    
    const resetPanes = () => {
        showView(editorView);
        editor.setValue('// Selecione um arquivo para editar');
        editor.updateOptions({ readOnly: true });
        monaco.editor.setModelLanguage(editor.getModel(), 'plaintext');
        openFileNameEl.textContent = 'Nenhum arquivo aberto';
        saveFileBtn.disabled = true;
        currentOpenFile = null;
    };

    const showView = (viewToShow) => {
        editorView.style.display = 'none';
        mediaView.style.display = 'none';
        viewToShow.style.display = viewToShow === editorView ? 'flex' : 'block';
    };

    const fetchAndRenderFiles = async (path) => {
        if (!activeConnectionId) return;
        currentPathEl.textContent = 'Carregando...';
        fileList.innerHTML = '';
        try {
            const files = await window.ssm.sftpList(activeConnectionId, path);
            currentPath = path;
            currentPathEl.textContent = path;
            if (path !== '/') fileList.innerHTML += `<li class="file-item parent-dir" data-path="${path.substring(0, path.lastIndexOf('/')) || '/'}">..</li>`;
            files.sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name));
            files.forEach(file => {
                const icon = file.isDirectory ? '📁' : '📄';
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = `${icon} ${file.name}`;
                li.dataset.path = `${path.endsWith('/') ? path : path + '/'}${file.name}`;
                li.dataset.name = file.name;
                li.dataset.type = file.isDirectory ? 'dir' : 'file';
                fileList.appendChild(li);
            });
        } catch (error) {
            Swal.fire({ title: 'Erro SFTP', text: `Não foi possível listar arquivos: ${error.message}`, icon: 'error', ...swalTheme });
            currentPathEl.textContent = 'Erro ao carregar';
        }
    };
    
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

    const loadConnections = async () => {
        currentConnections = await window.ssm.listConnections();
        renderConnections();
    };

    const openFile = async (filePath) => {
        const fileName = filePath.split('/').pop();
        const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
        if (MEDIA_EXTENSIONS.includes(extension)) await openMediaFile(filePath, extension);
        else if (BINARY_EXTENSIONS.includes(extension)) Swal.fire({ title: 'Arquivo Binário', text: `Arquivos do tipo ".${extension}" não podem ser abertos. Tente baixá-los.`, icon: 'info', ...swalTheme });
        else await openTextFile(filePath, extension);
    };

    const openTextFile = async (filePath, extension) => {
        showView(editorView);
        openFileNameEl.textContent = 'Carregando...';
        try {
            const content = await window.ssm.sftpReadFile(activeConnectionId, filePath);
            currentOpenFile = filePath;
            editor.setValue(content);
            editor.updateOptions({ readOnly: false });
            openFileNameEl.textContent = filePath;
            const language = monaco.languages.getLanguages().find(l => l.extensions?.includes(`.${extension}`))?.id || 'plaintext';
            monaco.editor.setModelLanguage(editor.getModel(), language);
        } catch (error) {
            Swal.fire({ title: 'Erro ao Abrir Arquivo', text: `Não foi possível ler o arquivo. Causa provável: Permissões insuficientes.\n\nDetalhes: ${error.message}`, icon: 'error', ...swalTheme });
            resetPanes();
        }
    };

    const openMediaFile = async (filePath, extension) => {
        showView(mediaView);
        mediaView.innerHTML = `<p>Carregando ${filePath}...</p>`;
        try {
            const base64Content = await window.ssm.sftpReadFileAsBase64(activeConnectionId, filePath);
            const mimeType = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`;
            mediaView.innerHTML = `<img src="data:${mimeType};base64,${base64Content}" alt="${filePath}" />`;
        } catch (error) {
            Swal.fire({ title: 'Erro ao Carregar Mídia', text: error.message, icon: 'error', ...swalTheme });
            resetPanes();
        }
    };
    
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

    const showContextMenu = (e, items) => {
        contextMenu.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'context-menu-item';
            div.textContent = item.label;
            div.onclick = () => { item.action(); contextMenu.style.display = 'none'; };
            contextMenu.appendChild(div);
        });
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.display = 'block';
    };
    
    // --- Event Listeners ---
    fileList.addEventListener('click', (e) => { const li = e.target.closest('li.file-item'); if (!li) return; if (li.dataset.type === 'dir' || li.classList.contains('parent-dir')) fetchAndRenderFiles(li.dataset.path); else openFile(li.dataset.path); });

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

    fileExplorer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const target = e.target.closest('.file-item');
        const remotePath = target?.dataset.path; const itemName = target?.dataset.name; const itemType = target?.dataset.type;
        let menuItems = [{
            label: 'Criar Nova Pasta',
            action: async () => {
                const { value: folderName } = await Swal.fire({ title: 'Nome da Nova Pasta', input: 'text', inputPlaceholder: 'nome_da_pasta', showCancelButton: true, ...swalTheme });
                if (folderName && folderName.trim()) {
                    await window.ssm.sftpCreateDir(activeConnectionId, `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${folderName.trim()}`);
                    fetchAndRenderFiles(currentPath);
                }
            }
        }];
        if (target) {
            if (itemType === 'file') {
                menuItems.unshift({ label: 'Baixar Arquivo', action: async () => { const result = await window.ssm.sftpDownloadFile(activeConnectionId, remotePath); if (result.success) Swal.fire({ title: 'Download Concluído', text: `Arquivo salvo em: ${result.path}`, icon: 'success', ...swalTheme }); }});
                menuItems.unshift({ label: 'Excluir Arquivo', action: async () => { Swal.fire({ title: 'Confirmar', text: `Excluir "${itemName}"?`, icon: 'warning', showCancelButton: true, ...swalTheme }).then(async (r) => { if (r.isConfirmed) { await window.ssm.sftpDeleteFile(activeConnectionId, remotePath); fetchAndRenderFiles(currentPath); } }); }});
            } else if (itemType === 'dir') {
                 menuItems.unshift({ label: 'Excluir Pasta', action: async () => { Swal.fire({ title: 'Confirmar', text: `Excluir pasta "${itemName}"? A pasta deve estar vazia.`, icon: 'warning', showCancelButton: true, ...swalTheme }).then(async (r) => { if (r.isConfirmed) { try { await window.ssm.sftpDeleteDir(activeConnectionId, remotePath); fetchAndRenderFiles(currentPath); } catch(err) { Swal.fire({ title: 'Erro', text: 'Não foi possível excluir. A pasta pode não estar vazia.', icon: 'error', ...swalTheme }); } } }); }});
            }
        }
        showContextMenu(e, menuItems);
    });

    window.addEventListener('click', () => contextMenu.style.display = 'none');
    
    addNewConnectionBtn.addEventListener('click', () => {
        let validatedConnectionData = null;
        Swal.fire({
            title: 'Nova Conexão',
            html: `
                <form id="swal-connection-form" class="swal-form">
                    <div class="swal-form-group"><label for="swal-name">Nome</label><input id="swal-name" name="name" class="swal2-input" placeholder="Meu Servidor Web" required></div>
                    <div class="swal-form-group"><label for="swal-host">Host</label><input id="swal-host" name="host" class="swal2-input" placeholder="192.168.1.100" required></div>
                    <div class="swal-form-group"><label for="swal-user">Usuário</label><input id="swal-user" name="user" class="swal2-input" placeholder="root" required></div>
                    <div class="swal-form-group"><label for="swal-authMethod">Autenticação</label><select id="swal-authMethod" name="authMethod" class="swal2-select"><option value="password">Senha</option><option value="key">Chave Privada</option></select></div>
                    <div id="swal-password-group" class="swal-form-group"><label for="swal-password">Senha</label><input type="password" id="swal-password" name="password" class="swal2-input"></div>
                    <div id="swal-key-path-group" class="swal-form-group" style="display: none;"><label for="swal-keyPath">Caminho da Chave</label><input id="swal-keyPath" name="keyPath" class="swal2-input" placeholder="C:\\Users\\...\\.ssh\\id_rsa"></div>
                </form>
            `,
            showCancelButton: true, cancelButtonText: 'Cancelar', confirmButtonText: 'Testar Conexão', showLoaderOnConfirm: true, customClass: { popup: 'swal-wide', }, ...swalTheme,
            didOpen: () => {
                const form = document.getElementById('swal-connection-form');
                const authSelect = document.getElementById('swal-authMethod');
                const passwordGroup = document.getElementById('swal-password-group');
                const keyPathGroup = document.getElementById('swal-key-path-group');
                const toggleAuthFields = () => { if (authSelect.value === 'key') { passwordGroup.style.display = 'none'; keyPathGroup.style.display = 'flex'; } else { passwordGroup.style.display = 'flex'; keyPathGroup.style.display = 'none'; } };
                authSelect.addEventListener('change', toggleAuthFields);
                toggleAuthFields();
                form.addEventListener('input', () => {
                    Swal.getConfirmButton().textContent = 'Testar Conexão';
                    validatedConnectionData = null;
                    Swal.hideValidationMessage();
                });
            },
            preConfirm: async () => {
                const form = document.getElementById('swal-connection-form');
                const formData = new FormData(form);
                const connData = Object.fromEntries(formData.entries());
                if (!connData.name || !connData.host || !connData.user) { Swal.showValidationMessage('Nome, Host e Usuário são obrigatórios'); return false; }
                try { await window.ssm.testConnection(connData); validatedConnectionData = connData; return true; } catch (error) { Swal.showValidationMessage(`Falha na conexão: ${error.message}`); return false; }
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (!validatedConnectionData) return;
                try {
                    const { password, ...dataToSave } = validatedConnectionData;
                    const newConnection = await window.ssm.addConnection(dataToSave);
                    if (dataToSave.authMethod === 'password' && password) await window.ssm.setPassword(newConnection.id, password);
                    await loadConnections();
                    Swal.fire({ title: 'Salvo!', text: 'Conexão adicionada com sucesso.', icon: 'success', ...swalTheme });
                } catch (error) { Swal.fire({ title: 'Erro ao Salvar', text: 'Não foi possível salvar a conexão.', icon: 'error', ...swalTheme }); }
            }
        });
    });

    // --- Initial Load ---
    loadConnections();
    updateUIForConnection(null);
});