import Swal from 'sweetalert2';
import * as monaco from 'monaco-editor';
import { Chart, registerables } from 'chart.js';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
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
                <button class="tab-link" data-tab="terminal">Terminal</button>
                <button class="tab-link" data-tab="processes">Processos</button>
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
                <div id="file-explorer" class="file-explorer"><div class="file-explorer-header"><h3>Explorador</h3><div id="current-path" class="current-path">/</div></div><ul id="file-list" class="file-list"></ul></div>
                <div class="editor-pane"><div id="editor-view" class="view"><div class="editor-header"><span id="open-file-name"></span><button id="save-file-btn" class="action-btn" disabled>Salvar</button></div><div id="editor-container"></div></div><div id="media-view" class="view media-viewer" style="display: none;"></div></div>
            </div>
            <div id="terminal" class="tab-content">
                <div id="terminal-container"></div>
            </div>
            <div id="processes" class="tab-content">
                <div class="process-manager">
                    <div class="pm-controls">
                        <input type="text" id="process-filter" placeholder="Filtrar por nome ou PID...">
                        <button id="refresh-processes-btn" class="action-btn">Atualizar</button>
                    </div>
                    <div class="pm-table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>PID</th>
                                    <th>Usuário</th>
                                    <th>%CPU</th>
                                    <th>%Memória</th>
                                    <th>Comando</th>
                                    <th>Ação</th>
                                </tr>
                            </thead>
                            <tbody id="process-list-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <div id="context-menu" class="context-menu"></div>
    `;

    // --- Selectors ---
    const connectionsList = document.getElementById('connections-list'), addNewConnectionBtn = document.getElementById('add-new-connection-btn'), tabs = document.querySelectorAll('.tab-link'), tabContents = document.querySelectorAll('.tab-content'), fileExplorer = document.getElementById('file-explorer'), fileList = document.getElementById('file-list'), currentPathEl = document.getElementById('current-path'), editorContainer = document.getElementById('editor-container'), saveFileBtn = document.getElementById('save-file-btn'), openFileNameEl = document.getElementById('open-file-name'), contextMenu = document.getElementById('context-menu'), editorView = document.getElementById('editor-view'), mediaView = document.getElementById('media-view'), dashboardWelcome = document.getElementById('dashboard-welcome'), dashboardContent = document.getElementById('dashboard-content'), uptimeText = document.getElementById('uptime-text'), cpuText = document.getElementById('cpu-text'), memText = document.getElementById('mem-text'), diskText = document.getElementById('disk-text'), terminalContainer = document.getElementById('terminal-container'), processListBody = document.getElementById('process-list-body'), refreshProcessesBtn = document.getElementById('refresh-processes-btn'), processFilterInput = document.getElementById('process-filter');

    // --- State & Constants ---
    let currentConnections = [], activeConnectionId = null, currentPath = '/', currentOpenFile = null, editor, cpuChart, memChart, diskChart, term, fitAddon, cleanupMetricsListener = null, cleanupTerminalListener = null, processCache = [];
    const swalTheme = { background: '#282c34', color: '#abb2bf', confirmButtonColor: '#2c5364', cancelButtonColor: '#e06c75' };
    const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'ico'];
    const BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'ico', 'bmp', 'tif', 'tiff', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'flac', 'aac', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dll', 'so', 'a', 'lib', 'jar', 'war', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'iso', 'dmg', 'bin'];

    // --- Initializations ---
    const createChart = (ctx, type, data) => new Chart(ctx, { type, data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    const initCharts = () => { if (cpuChart) cpuChart.destroy(); if (memChart) memChart.destroy(); if (diskChart) diskChart.destroy(); cpuChart = createChart(document.getElementById('cpuChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#61afef', '#3a3f4b'], borderWidth: 0 }] }); memChart = createChart(document.getElementById('memChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#98c379', '#3a3f4b'], borderWidth: 0 }] }); diskChart = createChart(document.getElementById('diskChart').getContext('2d'), 'doughnut', { labels: ['Used', 'Free'], datasets: [{ data: [0, 100], backgroundColor: ['#e06c75', '#3a3f4b'], borderWidth: 0 }] }); };
    editor = monaco.editor.create(editorContainer, { value: '// Selecione um arquivo para editar', language: 'plaintext', theme: 'vs-dark', automaticLayout: true, readOnly: true });
    editor.onDidChangeModelContent(() => { if (currentOpenFile) saveFileBtn.disabled = false; });
    const terminalObserver = new ResizeObserver(() => { if (term && fitAddon && document.getElementById('terminal').classList.contains('active')) { try { fitAddon.fit(); window.ssm.terminalResize(term.cols, term.rows); } catch (e) { console.log('Error fitting terminal:', e.message); } } });
    terminalObserver.observe(terminalContainer);

    // --- Process Manager ---
    const parsePsOutput = (output) => {
        return output.trim().split('\n').slice(1).map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                pid: parts[0], user: parts[1], cpu: parts[2], mem: parts[3],
                command: parts.slice(4).join(' ')
            };
        });
    };
    const renderProcesses = (filter = '') => { if (!processListBody) return; const lowerCaseFilter = filter.toLowerCase(); const filteredProcesses = processCache.filter(p => p.command.toLowerCase().includes(lowerCaseFilter) || p.pid.includes(lowerCaseFilter)); processListBody.innerHTML = filteredProcesses.map(p => `<tr><td>${p.pid}</td><td>${p.user}</td><td>${p.cpu}</td><td>${p.mem}</td><td class="command-cell">${p.command}</td><td><button class="kill-btn" data-pid="${p.pid}" data-command="${p.command}">Encerrar</button></td></tr>`).join(''); };
    const fetchAndRenderProcesses = async () => { if (!activeConnectionId) return; processListBody.innerHTML = '<tr><td colspan="6">Carregando processos...</td></tr>'; try { const output = await window.ssm.processList(activeConnectionId); processCache = parsePsOutput(output); renderProcesses(processFilterInput.value); } catch (error) { Swal.fire({ title: 'Erro', text: `Não foi possível carregar processos: ${error.message}`, icon: 'error', ...swalTheme }); processListBody.innerHTML = '<tr><td colspan="6">Falha ao carregar.</td></tr>'; } };

    // --- Terminal Management ---
    const setupTerminal = () => { if (term) term.dispose(); if (cleanupTerminalListener) cleanupTerminalListener(); term = new Terminal({ cursorBlink: true, theme: { background: '#21252b', foreground: '#abb2bf' } }); fitAddon = new FitAddon(); term.loadAddon(fitAddon); term.open(terminalContainer); fitAddon.fit(); window.ssm.terminalResize(term.cols, term.rows); window.ssm.terminalStart(activeConnectionId); term.onData(data => window.ssm.terminalWrite(data)); cleanupTerminalListener = window.ssm.onTerminalData(data => term.write(data)); };
    const destroyTerminal = () => { if (term) { term.dispose(); term = null; } if (cleanupTerminalListener) { cleanupTerminalListener(); cleanupTerminalListener = null; } window.ssm.terminalStop(); };

    // --- UI & View Management ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(c => c.classList.remove('active'));
            const activeTabContent = document.getElementById(tab.dataset.tab);
            activeTabContent.classList.add('active');
            if (tab.dataset.tab === 'terminal' && activeConnectionId) { setupTerminal(); } else { destroyTerminal(); }
            if (tab.dataset.tab === 'processes' && activeConnectionId) { fetchAndRenderProcesses(); }
        });
    });
    const updateUIForConnection = (connId) => {
        activeConnectionId = connId;
        renderConnections();
        if (cleanupMetricsListener) { cleanupMetricsListener(); cleanupMetricsListener = null; }
        destroyTerminal();
        window.ssm.stopMetrics();
        if (activeConnectionId) {
            window.ssm.startMetrics(activeConnectionId);
            cleanupMetricsListener = window.ssm.onMetricsUpdate(updateDashboard);
            dashboardWelcome.style.display = 'none';
            dashboardContent.style.display = 'grid';
            initCharts();
            const activeTab = document.querySelector('.tab-link.active');
            if (activeTab && activeTab.dataset.tab === 'terminal') { setupTerminal(); }
            if (activeTab && activeTab.dataset.tab === 'processes') { fetchAndRenderProcesses(); }
        } else {
            dashboardWelcome.style.display = 'block';
            dashboardContent.style.display = 'none';
            processCache = [];
            renderProcesses();
        }
        currentPath = '/';
        resetPanes();
        fileList.innerHTML = connId ? '' : '<li>Selecione uma conexão para ver os arquivos.</li>';
        currentPathEl.textContent = '/';
        if (connId) fetchAndRenderFiles('/');
    };
    const updateDashboard = (metrics) => { if (!activeConnectionId) return; if (metrics.status === 'error') { uptimeText.textContent = `Erro ao carregar: ${metrics.message}`; return; } const { uptime, memory, disk, cpu } = metrics.data; uptimeText.textContent = uptime; cpuText.textContent = `${cpu}%`; memText.textContent = `${memory.used} / ${memory.total} MB`; diskText.textContent = `${disk.used} / ${disk.total} (${disk.percent})`; cpuChart.data.datasets[0].data = [cpu, 100 - cpu]; cpuChart.update('none'); memChart.data.datasets[0].data = [memory.used, memory.free]; memChart.update('none'); const diskPercent = parseInt(disk.percent.replace('%', '')); diskChart.data.datasets[0].data = [diskPercent, 100 - diskPercent]; diskChart.update('none'); };
    const resetPanes = () => { showView(editorView); editor.setValue('// Selecione um arquivo para editar'); editor.updateOptions({ readOnly: true }); monaco.editor.setModelLanguage(editor.getModel(), 'plaintext'); openFileNameEl.textContent = 'Nenhum arquivo aberto'; saveFileBtn.disabled = true; currentOpenFile = null; };
    const showView = (viewToShow) => { editorView.style.display = 'none'; mediaView.style.display = 'none'; viewToShow.style.display = viewToShow === editorView ? 'flex' : 'block'; };
    const fetchAndRenderFiles = async (path) => { if (!activeConnectionId) return; currentPathEl.textContent = 'Carregando...'; fileList.innerHTML = ''; try { const files = await window.ssm.sftpList(activeConnectionId, path); currentPath = path; currentPathEl.textContent = path; if (path !== '/') fileList.innerHTML += `<li class="file-item parent-dir" data-path="${path.substring(0, path.lastIndexOf('/')) || '/'}">..</li>`; files.sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name)); files.forEach(file => { const icon = file.isDirectory ? '📁' : '📄'; const li = document.createElement('li'); li.className = 'file-item'; li.innerHTML = `${icon} ${file.name}`; li.dataset.path = `${path.endsWith('/') ? path : path + '/'}${file.name}`; li.dataset.name = file.name; li.dataset.type = file.isDirectory ? 'dir' : 'file'; fileList.appendChild(li); }); } catch (error) { Swal.fire({ title: 'Erro SFTP', text: `Não foi possível listar arquivos: ${error.message}`, icon: 'error', ...swalTheme }); currentPathEl.textContent = 'Erro ao carregar'; } };
    const renderConnections = () => { connectionsList.innerHTML = ''; currentConnections.forEach(conn => { const li = document.createElement('li'); li.dataset.id = conn.id; if (conn.id === activeConnectionId) li.classList.add('active'); const nameSpan = document.createElement('span'); nameSpan.textContent = conn.name; nameSpan.title = `${conn.user}@${conn.host}`; li.appendChild(nameSpan); const deleteBtn = document.createElement('button'); deleteBtn.innerHTML = '&times;'; deleteBtn.className = 'delete-btn'; deleteBtn.title = 'Excluir Conexão'; li.appendChild(deleteBtn); li.addEventListener('click', (e) => (e.target !== deleteBtn) && updateUIForConnection(conn.id)); deleteBtn.addEventListener('click', () => handleDeleteClick(conn)); connectionsList.appendChild(li); }); };
    const loadConnections = async () => { currentConnections = await window.ssm.listConnections(); renderConnections(); };
    const openFile = async (filePath) => { const fileName = filePath.split('/').pop(); const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : ''; if (MEDIA_EXTENSIONS.includes(extension)) await openMediaFile(filePath, extension); else if (BINARY_EXTENSIONS.includes(extension)) Swal.fire({ title: 'Arquivo Binário', text: `Arquivos do tipo ".${extension}" não podem ser abertos. Tente baixá-los.`, icon: 'info', ...swalTheme }); else await openTextFile(filePath, extension); };
    const openTextFile = async (filePath, extension) => { showView(editorView); openFileNameEl.textContent = 'Carregando...'; try { const content = await window.ssm.sftpReadFile(activeConnectionId, filePath); currentOpenFile = filePath; editor.setValue(content); editor.updateOptions({ readOnly: false }); openFileNameEl.textContent = filePath; const language = monaco.languages.getLanguages().find(l => l.extensions?.includes(`.${extension}`))?.id || 'plaintext'; monaco.editor.setModelLanguage(editor.getModel(), language); } catch (error) { Swal.fire({ title: 'Erro ao Abrir Arquivo', text: `Não foi possível ler o arquivo. Causa provável: Permissões insuficientes.\n\nDetalhes: ${error.message}`, icon: 'error', ...swalTheme }); resetPanes(); } };
    const openMediaFile = async (filePath, extension) => { showView(mediaView); mediaView.innerHTML = `<p>Carregando ${filePath}...</p>`; try { const base64Content = await window.ssm.sftpReadFileAsBase64(activeConnectionId, filePath); const mimeType = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`; mediaView.innerHTML = `<img src="data:${mimeType};base64,${base64Content}" alt="${filePath}" />`; } catch (error) { Swal.fire({ title: 'Erro ao Carregar Mídia', text: error.message, icon: 'error', ...swalTheme }); resetPanes(); } };
    const handleDeleteClick = (conn) => { Swal.fire({ title: 'Confirmar Exclusão', text: `Deseja excluir "${conn.name}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, excluir!', cancelButtonText: 'Cancelar', ...swalTheme }).then(async (result) => { if (result.isConfirmed) { await window.ssm.removeConnection(conn.id); if (activeConnectionId === conn.id) updateUIForConnection(null); await loadConnections(); Swal.fire({ title: 'Excluído!', text: 'Conexão removida.', icon: 'success', ...swalTheme }); } }); };
    const showContextMenu = (e, items) => { contextMenu.innerHTML = ''; items.forEach(item => { const div = document.createElement('div'); div.className = 'context-menu-item'; div.textContent = item.label; div.onclick = () => { item.action(); contextMenu.style.display = 'none'; }; contextMenu.appendChild(div); }); contextMenu.style.left = `${e.clientX}px`; contextMenu.style.top = `${e.clientY}px`; contextMenu.style.display = 'block'; };

    // --- Event Listeners ---
    processListBody.addEventListener('click', async (e) => { const killBtn = e.target.closest('.kill-btn'); if (killBtn && activeConnectionId) { const pid = killBtn.dataset.pid; const command = killBtn.dataset.command; const result = await Swal.fire({ title: 'Encerrar Processo?', text: `Tem certeza que deseja encerrar o processo ${pid} (${command})?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, encerrar!', cancelButtonText: 'Cancelar', ...swalTheme }); if (result.isConfirmed) { try { Swal.fire({ title: 'Encerrando...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...swalTheme }); await window.ssm.processKill(activeConnectionId, pid); Swal.close(); await fetchAndRenderProcesses(); } catch (error) { Swal.fire({ title: 'Erro', text: `Não foi possível encerrar o processo: ${error.message}`, icon: 'error', ...swalTheme }); } } } });
    refreshProcessesBtn.addEventListener('click', fetchAndRenderProcesses);
    processFilterInput.addEventListener('input', () => renderProcesses(processFilterInput.value));
    fileList.addEventListener('click', (e) => { const li = e.target.closest('li.file-item'); if (!li) return; if (li.dataset.type === 'dir' || li.classList.contains('parent-dir')) fetchAndRenderFiles(li.dataset.path); else openFile(li.dataset.path); });
    saveFileBtn.addEventListener('click', async () => { if (!currentOpenFile || saveFileBtn.disabled) return; const content = editor.getValue(); Swal.fire({ title: 'Salvando...', text: `Salvando ${currentOpenFile}`, allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...swalTheme }); try { await window.ssm.sftpWriteFile(activeConnectionId, currentOpenFile, content); saveFileBtn.disabled = true; Swal.fire({ title: 'Salvo!', text: `${currentOpenFile} foi salvo com sucesso.`, icon: 'success', ...swalTheme }); } catch (error) { Swal.fire({ title: 'Erro ao Salvar', text: error.message, icon: 'error', ...swalTheme }); } });
    fileExplorer.addEventListener('contextmenu', (e) => { e.preventDefault(); const target = e.target.closest('.file-item'); const remotePath = target?.dataset.path; const itemName = target?.dataset.name; const itemType = target?.dataset.type; let menuItems = [{ label: 'Upload de Arquivo', action: async () => { const result = await window.ssm.sftpUploadFile(activeConnectionId, currentPath); if (result.success) { fetchAndRenderFiles(currentPath); Swal.fire({ title: 'Upload Concluído', text: `${result.fileName} enviado com sucesso para ${currentPath}`, icon: 'success', timer: 2000, showConfirmButton: false, ...swalTheme }); } else if (result.reason !== 'canceled') { Swal.fire({ title: 'Erro no Upload', text: result.error, icon: 'error', ...swalTheme }); } } }, { label: 'Criar Nova Pasta', action: async () => { const { value: folderName } = await Swal.fire({ title: 'Nome da Nova Pasta', input: 'text', inputPlaceholder: 'nome_da_pasta', showCancelButton: true, ...swalTheme }); if (folderName && folderName.trim()) { await window.ssm.sftpCreateDir(activeConnectionId, `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${folderName.trim()}`); fetchAndRenderFiles(currentPath); } } }]; if (target) { if (itemType === 'file') { menuItems.unshift({ label: 'Baixar Arquivo', action: async () => { const result = await window.ssm.sftpDownloadFile(activeConnectionId, remotePath); if (result.success) Swal.fire({ title: 'Download Concluído', text: `Arquivo salvo em: ${result.path}`, icon: 'success', ...swalTheme }); } }); menuItems.unshift({ label: 'Excluir Arquivo', action: async () => { Swal.fire({ title: 'Confirmar', text: `Excluir "${itemName}"?`, icon: 'warning', showCancelButton: true, ...swalTheme }).then(async (r) => { if (r.isConfirmed) { await window.ssm.sftpDeleteFile(activeConnectionId, remotePath); fetchAndRenderFiles(currentPath); } }); } }); } else if (itemType === 'dir') { menuItems.unshift({ label: 'Excluir Pasta', action: async () => { Swal.fire({ title: 'Confirmar', text: `Excluir pasta "${itemName}"? A pasta deve estar vazia.`, icon: 'warning', showCancelButton: true, ...swalTheme }).then(async (r) => { if (r.isConfirmed) { try { await window.ssm.sftpDeleteDir(activeConnectionId, remotePath); fetchAndRenderFiles(currentPath); } catch (err) { Swal.fire({ title: 'Erro', text: 'Não foi possível excluir. A pasta pode não estar vazia.', icon: 'error', ...swalTheme }); } } }); } }); } } showContextMenu(e, menuItems); });
    window.addEventListener('click', () => contextMenu.style.display = 'none');
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!saveFileBtn.disabled) saveFileBtn.click(); } });
    addNewConnectionBtn.addEventListener('click', () => { let validatedConnectionData = null; Swal.fire({ title: 'Nova Conexão', html: `<form id="swal-connection-form" class="swal-form"><div class="swal-form-group"><label for="swal-name">Nome</label><input id="swal-name" name="name" class="swal2-input" placeholder="Meu Servidor Web" required></div><div class="swal-form-group"><label for="swal-host">Host</label><input id="swal-host" name="host" class="swal2-input" placeholder="192.168.1.100" required></div><div class="swal-form-group"><label for="swal-user">Usuário</label><input id="swal-user" name="user" class="swal2-input" placeholder="root" required></div><div class="swal-form-group"><label for="swal-authMethod">Autenticação</label><select id="swal-authMethod" name="authMethod" class="swal2-select"><option value="password">Senha</option><option value="key">Chave Privada</option></select></div><div id="swal-password-group" class="swal-form-group"><label for="swal-password">Senha</label><input type="password" id="swal-password" name="password" class="swal2-input"></div><div id="swal-key-path-group" class="swal-form-group" style="display: none;"><label for="swal-keyPath">Caminho da Chave</label><input id="swal-keyPath" name="keyPath" class="swal2-input" placeholder="C:\\Users\\...\\.ssh\\id_rsa"></div></form>`, showCancelButton: true, cancelButtonText: 'Cancelar', confirmButtonText: 'Testar Conexão', showLoaderOnConfirm: true, customClass: { popup: 'swal-wide', }, ...swalTheme, didOpen: () => { const form = document.getElementById('swal-connection-form'); const authSelect = document.getElementById('swal-authMethod'); const passwordGroup = document.getElementById('swal-password-group'); const keyPathGroup = document.getElementById('swal-key-path-group'); const toggleAuthFields = () => { if (authSelect.value === 'key') { passwordGroup.style.display = 'none'; keyPathGroup.style.display = 'flex'; } else { passwordGroup.style.display = 'flex'; keyPathGroup.style.display = 'none'; } }; authSelect.addEventListener('change', toggleAuthFields); toggleAuthFields(); form.addEventListener('input', () => { Swal.getConfirmButton().textContent = 'Testar Conexão'; validatedConnectionData = null; Swal.hideValidationMessage(); }); }, preConfirm: async () => { const form = document.getElementById('swal-connection-form'); const formData = new FormData(form); const connData = Object.fromEntries(formData.entries()); if (!connData.name || !connData.host || !connData.user) { Swal.showValidationMessage('Nome, Host e Usuário são obrigatórios'); return false; } try { await window.ssm.testConnection(connData); validatedConnectionData = connData; return true; } catch (error) { Swal.showValidationMessage(`Falha na conexão: ${error.message}`); return false; } } }).then(async (result) => { if (result.isConfirmed) { if (!validatedConnectionData) return; try { const { password, ...dataToSave } = validatedConnectionData; const newConnection = await window.ssm.addConnection(dataToSave); if (dataToSave.authMethod === 'password' && password) await window.ssm.setPassword(newConnection.id, password); await loadConnections(); Swal.fire({ title: 'Salvo!', text: 'Conexão adicionada com sucesso.', icon: 'success', ...swalTheme }); } catch (error) { Swal.fire({ title: 'Erro ao Salvar', text: 'Não foi possível salvar a conexão.', icon: 'error', ...swalTheme }); } } }); });

    // --- Initial Load ---
    loadConnections();
    updateUIForConnection(null);
});