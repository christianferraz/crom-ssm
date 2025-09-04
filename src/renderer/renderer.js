document.addEventListener('DOMContentLoaded', () => {
    const connectionsList = document.getElementById('connections-list');
    const connectionForm = document.getElementById('connection-form');
    const commandOutput = document.getElementById('command-output');
    const authMethodSelect = document.getElementById('authMethod');
    const passwordGroup = document.getElementById('password-group');
    const keyPathGroup = document.getElementById('key-path-group');
    const testBtn = document.getElementById('test-connection-btn');
    const saveBtn = document.getElementById('save-connection-btn');

    let currentConnections = [];
    let activeConnectionId = null;
    let validatedConnectionData = null;

    const swalTheme = {
        background: '#282c34',
        color: '#abb2bf',
        confirmButtonColor: '#2c5364',
        cancelButtonColor: '#e06c75',
    };

    const handleAuthMethodChange = () => {
        if (authMethodSelect.value === 'key') {
            passwordGroup.classList.add('hidden');
            keyPathGroup.classList.remove('hidden');
        } else {
            passwordGroup.classList.remove('hidden');
            keyPathGroup.classList.add('hidden');
        }
        saveBtn.disabled = true;
        validatedConnectionData = null;
    };

    authMethodSelect.addEventListener('change', handleAuthMethodChange);
    connectionForm.addEventListener('input', () => {
        saveBtn.disabled = true;
        validatedConnectionData = null;
    });

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

            li.addEventListener('click', (e) => {
                if (e.target === deleteBtn) return;
                handleConnectionClick(conn);
            });
            deleteBtn.addEventListener('click', () => handleDeleteClick(conn));

            connectionsList.appendChild(li);
        });
    };
    
    const handleConnectionClick = async (conn) => {
        activeConnectionId = conn.id;
        renderConnections();
        commandOutput.classList.remove('error');
        commandOutput.textContent = `Executando 'uptime' em ${conn.name}...`;
        try {
            const result = await window.ssm.exec(conn.id, 'uptime');
            commandOutput.textContent = `Saída de 'uptime' em ${conn.name}:\n\n${result.stdout}`;
        } catch (error) {
            commandOutput.classList.add('error');
            commandOutput.textContent = `Erro ao executar comando em ${conn.name}:\n\n${error.message}`;
        }
    };

    const handleDeleteClick = (conn) => {
        Swal.fire({
            title: 'Confirmar Exclusão',
            text: `Tem certeza que deseja excluir a conexão "${conn.name}"?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sim, excluir!',
            cancelButtonText: 'Cancelar',
            ...swalTheme
        }).then(async (result) => {
            if (result.isConfirmed) {
                await window.ssm.removeConnection(conn.id);
                if(activeConnectionId === conn.id) {
                    activeConnectionId = null;
                    commandOutput.textContent = 'Selecione uma conexão para executar um comando de teste.';
                }
                await loadConnections();
                Swal.fire({ title: 'Excluído!', text: 'A conexão foi removida.', icon: 'success', ...swalTheme });
            }
        });
    };

    const loadConnections = async () => {
        currentConnections = await window.ssm.listConnections();
        renderConnections();
    };

    testBtn.addEventListener('click', async () => {
        const formData = new FormData(connectionForm);
        const connectionData = {
            name: formData.get('name'), host: formData.get('host'), user: formData.get('user'),
            authMethod: formData.get('authMethod'), keyPath: formData.get('keyPath') || null,
            password: formData.get('password')
        };

        if(!connectionData.name || !connectionData.host || !connectionData.user) {
            Swal.fire({ title: 'Campos Obrigatórios', text: 'Preencha Nome, Host e Usuário.', icon: 'warning', ...swalTheme });
            return;
        }

        Swal.fire({ title: 'Testando...', text: `Conectando a ${connectionData.host}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...swalTheme });

        try {
            await window.ssm.testConnection(connectionData);
            validatedConnectionData = connectionData;
            saveBtn.disabled = false;
            Swal.fire({ title: 'Sucesso!', text: 'Conexão bem-sucedida.', icon: 'success', ...swalTheme });
        } catch (error) {
            validatedConnectionData = null;
            saveBtn.disabled = true;
            Swal.fire({ title: 'Falha na Conexão', text: error.message, icon: 'error', ...swalTheme });
        }
    });

    connectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validatedConnectionData) {
            Swal.fire({ title: 'Atenção', text: 'Você deve testar a conexão com sucesso antes de salvar.', icon: 'info', ...swalTheme });
            return;
        }

        try {
            const { password, ...dataToSave } = validatedConnectionData;
            const newConnection = await window.ssm.addConnection(dataToSave);
            if (dataToSave.authMethod === 'password' && password) {
                await window.ssm.setPassword(newConnection.id, password);
            }
            connectionForm.reset();
            handleAuthMethodChange();
            await loadConnections();
            Swal.fire({ title: 'Salvo!', text: 'Conexão adicionada com sucesso.', icon: 'success', ...swalTheme });
        } catch (error) {
            console.error('Failed to add connection:', error);
            Swal.fire({ title: 'Erro ao Salvar', text: 'Não foi possível salvar a conexão.', icon: 'error', ...swalTheme });
        }
    });

    handleAuthMethodChange();
    loadConnections();
});