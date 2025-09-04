# Crom-SSM (Simple Server Manager)

![License](https://img.shields.io/badge/license-ISC-blue.svg) ![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)

Um Gerenciador de Servidores Simples, Leve e Moderno, construído com Electron, para centralizar suas tarefas de DevOps e administração de sistemas em uma única interface limpa e reativa.

![Screenshot do Crom-SSM](https://i.imgur.com/link-para-screenshot.png) 
*(Nota: Substitua o link acima por um screenshot real da aplicação)*

---

## ✨ Principais Funcionalidades

Crom-SSM integra as ferramentas mais essenciais para o gerenciamento diário de servidores Linux, eliminando a necessidade de alternar entre múltiplos aplicativos.

*   **Gerenciador de Conexões:**
    *   Salve e gerencie múltiplas conexões SSH de forma segura.
    *   Suporte para autenticação por senha e por chave privada SSH.
    *   As senhas são armazenadas de forma segura no chaveiro do sistema operacional.
    *   Indicadores de status visuais (ativo, inativo, erro) para cada conexão.

*   **Dashboard Avançado:**
    *   **Métricas em Tempo Real:** Acompanhe CPU, Memória, Disco e Uptime.
    *   **Gráficos Históricos:** Visualize o uso de CPU e Memória ao longo do último minuto para identificar tendências e picos.
    *   **Informações do Sistema:** Tenha acesso rápido a detalhes como SO, Kernel, Arquitetura e modelo da CPU.
    *   **Atividade de Rede:** Monitore o tráfego de entrada e saída em tempo real.
    *   **Monitor de Serviços:** Defina serviços (ex: `nginx`, `docker`) por conexão e veja o status (`active`, `inactive`, `failed`) ser atualizado dinamicamente.

*   **Explorador de Arquivos SFTP:**
    *   Navegue, crie, renomeie e exclua arquivos e pastas no servidor remoto.
    *   Faça upload e download de arquivos com facilidade através de diálogos nativos.
    *   Visualizador de imagens e mídia integrado.

*   **Editor de Código Integrado:**
    *   Editor de texto baseado no Monaco Editor (o mesmo do VS Code).
    *   Suporte a syntax highlighting para dezenas de linguagens.
    *   Salve as alterações diretamente no servidor com `Ctrl+S`.

*   **Terminal Multi-Abas:**
    *   Abra múltiplas abas de terminal para uma única conexão.
    *   As sessões do terminal são persistentes enquanto você navega por outras seções da aplicação.

*   **Gerenciador de Processos:**
    *   Liste todos os processos em execução, ordenados por uso de CPU.
    *   Filtre processos por nome ou PID.
    *   Encerre processos com um clique (com diálogo de confirmação).

*   **Snippets de Comandos:**
    *   Crie, edite e salve comandos ou scripts usados com frequência.
    *   Execute snippets com um clique no terminal ativo para agilizar tarefas repetitivas.

---

## 🛠️ Pilha Tecnológica

*   **Core:** [Electron](https://www.electronjs.org/)
*   **Frontend:** JavaScript (ES6+), CSS3, HTML5 (sem frameworks)
*   **Backend (Main Process):** Node.js
*   **Comunicação SSH/SFTP:** [ssh2](https://github.com/mscdex/ssh2)
*   **Editor de Código:** [Monaco Editor](https://microsoft.github.io/monaco-editor/)
*   **Terminal:** [Xterm.js](https://xtermjs.org/)
*   **Gráficos:** [Chart.js](https://www.chartjs.org/)
*   **Modais e Alertas:** [SweetAlert2](https://sweetalert2.github.io/)
*   **Bundler:** [Webpack](https://webpack.js.org/)
*   **Empacotamento:** [Electron Builder](https://www.electron.build/)

---

## 🚀 Começando

Para executar o projeto localmente, siga estes passos:

1.  **Clone o repositório:**
    ```sh
    git clone https://github.com/seu-usuario/crom-ssm.git
    cd crom-ssm
    ```

2.  **Instale as dependências:**
    ```sh
    npm install
    ```

3.  **Reconstrua os módulos nativos:**
    Este passo é crucial para que pacotes como `keytar` funcionem corretamente com o Electron.
    ```sh
    npm run rebuild
    ```

4.  **Execute a aplicação em modo de desenvolvimento:**
    ```sh
    npm start
    ```

5.  **Para criar um executável:**
    Use o comando `dist` para empacotar a aplicação para sua plataforma atual.
    ```sh
    npm run dist
    ```

---

## 🧭 Roadmap e Próximas Etapas

O projeto está em desenvolvimento ativo. Nosso planejamento inclui as seguintes funcionalidades futuras:

*   **[ ] Visualizador de Logs em Tempo Real:** Uma nova aba para acompanhar múltiplos arquivos de log (`tail -f`).
*   **[ ] Tela de Configurações Globais:**
    *   Personalização do intervalo de atualização do dashboard.
    *   Opção para habilitar uma senha mestra para abrir a aplicação.
    *   Seleção de temas.
*   **[ ] Grupos de Conexão e Execução em Lote:**
    *   Organizar conexões em grupos (ex: Produção, Staging).
    *   Executar snippets em todos os servidores de um grupo simultaneamente.
*   **[ ] Suporte a Passphrase para Chaves SSH:** Permitir o uso de chaves SSH protegidas por senha.
*   **[ ] Empacotamento e Auto-Atualização:** Implementar `electron-updater` para atualizações automáticas.

---

## ❤️ Contribuições

Contribuições são o que tornam a comunidade de código aberto um lugar incrível para aprender, inspirar e criar. Qualquer contribuição que você fizer será **muito apreciada**.

1.  Faça um Fork do Projeto
2.  Crie sua Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Faça o Commit de suas alterações (`git commit -m 'Add some AmazingFeature'`)
4.  Faça o Push para a Branch (`git push origin feature/AmazingFeature`)
5.  Abra um Pull Request

---

## 📄 Licença

Distribuído sob a licença ISC.