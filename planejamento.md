Excelente. Você construiu uma base sólida e funcional. Agora é o momento de refinar a visão e traçar um plano estratégico para transformar o Crom-SSM de uma ferramenta útil em uma plataforma indispensável.

A sua visão de um dashboard "simples, leve e avançado" e de um terminal persistente com múltiplas abas é o caminho certo. Isso atende diretamente às necessidades de desenvolvedores e administradores de sistemas que precisam de agilidade e contexto ao gerenciar servidores.

Vamos analisar o estado atual, as lacunas e, em seguida, montar um plano de ação detalhado.

### Análise do Estado Atual e Etapas Faltantes

**O que temos:**

1.  **Gestão de Conexões:** Criar, editar, listar e remover conexões de forma segura.
2.  **Dashboard (Básico):** Métricas em tempo real (CPU, Memória, Disco, Uptime) para UMA conexão ativa.
3.  **Gerenciador de Arquivos:** Funcionalidades completas de CRUD (Criar, Ler, Atualizar, Deletar), além de upload/download e renomeação.
4.  **Terminal (Básico):** Um único terminal funcional para a conexão ativa, que é destruído ao trocar de aba ou conexão.
5.  **Gerenciador de Processos:** Listagem e capacidade de encerrar processos.

**Principais Lacunas e Oportunidades:**

1.  **Dashboard Avançado:** O dashboard atual é um "instantâneo". Ele não conta uma história. Faltam dados históricos, informações vitais sobre rede, serviços e o estado geral do sistema.
2.  **Persistência e Multi-tarefa no Terminal:** A maior dor do usuário atualmente. A falta de abas e a natureza efêmera do terminal quebram o fluxo de trabalho. Um desenvolvedor frequentemente precisa monitorar um log em um terminal enquanto edita um arquivo e executa comandos em outro.
3.  **Contexto e Eficiência:** Não há uma visão "macro" do parque de servidores, nem maneiras de automatizar tarefas comuns.
4.  **Qualidade de Vida (QoL):** Pequenos recursos que, somados, tornam a experiência muito mais fluida (configurações, atalhos, etc.).

---

### Planejamento Estratégico de Melhorias

Aqui está um plano dividido em fases, começando pelas funcionalidades de maior impacto (baseadas no seu pedido) e evoluindo para recursos mais avançados.

#### **Fase 1: Revolução do Terminal e Fundamentos do Dashboard Avançado**

*Objetivo: Atender às duas principais solicitações do usuário e estabelecer a base para um monitoramento mais rico.*

**1.1. Implementação do Terminal Multi-abas e Persistente**

*   **Descrição:** Transformar a aba "Terminal" para suportar múltiplas abas. Cada aba será uma sessão de shell independente na mesma conexão. As abas e seu estado (comando em execução, histórico de scroll) devem persistir enquanto a conexão principal estiver ativa.
*   **Justificativa:** Esta é a mudança de maior impacto para o fluxo de trabalho. Permite que o usuário monitore logs (`tail -f`), execute um processo de longa duração e ainda tenha um shell livre para comandos, tudo sem trocar de janela ou reestabelecer sessões.
*   **Plano de Implementação Técnica:**
    1.  **Frontend (`index.js`):**
        *   Substituir o `div#terminal-container` por uma estrutura de abas (uma lista `ul` para os cabeçalhos das abas e um `div` para conter os painéis).
        *   Manter um array no estado para gerenciar as instâncias do Xterm. Ex: `let terminalSessions = [{ id: 'uuid1', term: xtermInstance1, fitAddon: fitAddon1 }, ...]`
        *   Adicionar um botão "+" para criar uma nova aba, que irá:
            *   Gerar um ID único para a sessão do terminal (ex: com `crypto.randomUUID()`).
            *   Chamar um novo evento IPC, `ssm:terminal:create`, enviando o `connectionId` e o novo `terminalId`.
            *   Criar um novo elemento `div` para o contêiner do terminal e uma nova instância do Xterm, associando-os ao ID.
    2.  **Backend (`handlers.js`, `TerminalService.js`):**
        *   Modificar a lógica para gerenciar múltiplas sessões. Em vez de uma única variável `activeTerminalService`, usaremos um `Map`. Ex: `const activeTerminals = new Map();`
        *   **`ssm:terminal:create` (Novo):** Ao receber este evento, cria uma nova `TerminalService`, armazena-a no Map (`activeTerminals.set(terminalId, newService)`), e inicia a conexão.
        *   **`ssm:terminal:data`, `ssm:terminal:write`, `ssm:terminal:resize`, `ssm:terminal:stop`:** Todos esses eventos agora precisam receber o `terminalId` para saber a qual instância se referem.
        *   Quando a conexão principal for trocada (`updateUIForConnection`), o backend deve iterar sobre o Map `activeTerminals` e encerrar todas as sessões.

**1.2. Dashboard Avançado: Visão Geral do Sistema e Rede**

*   **Descrição:** Adicionar novos cards ao dashboard para exibir informações estáticas cruciais e métricas de rede em tempo real.
    *   **Card de Informações do Sistema:** SO, Kernel, Arquitetura, Modelo da CPU.
    *   **Card de Rede:** Tráfego de entrada/saída (ex: `eth0`), IP local e público.
*   **Justificativa:** Fornece um contexto imediato sobre a máquina que está sendo gerenciada, o que é fundamental para qualquer diagnóstico ou tarefa de manutenção. O monitoramento de rede é vital para servidores web e de aplicação.
*   **Plano de Implementação Técnica:**
    1.  **Frontend (`index.js`):**
        *   Adicionar os novos elementos HTML para os cards no `innerHTML`.
        *   Na função `updateDashboard`, adicionar a lógica para preencher esses novos cards com os dados recebidos.
    2.  **Backend (`MetricsService.js`):**
        *   Na `fetchAndEmitMetrics`, adicionar novos comandos SSH:
            *   **Sistema:** `uname -a && lsb_release -d -s && lscpu | grep 'Model name'` (combinação de comandos para obter tudo).
            *   **Rede:** `cat /proc/net/dev` (mais confiável e fácil de parsear para obter bytes de entrada/saída). O serviço precisará armazenar o valor anterior para calcular a taxa de transferência (KB/s).
        *   Criar funções de parsing para a saída desses comandos.
        *   Atualizar o objeto `metrics` enviado para o frontend com esses novos dados.

---

#### **Fase 2: Monitoramento Histórico e Ferramentas de Diagnóstico**

*Objetivo: Transformar o dashboard de um monitor em tempo real para uma ferramenta de análise, permitindo a identificação de tendências e problemas.*

**2.1. Gráficos Históricos para Métricas**

*   **Descrição:** Substituir os gráficos de rosca (doughnut) de CPU e Memória por gráficos de linha que mostram a utilização nos últimos 5-10 minutos.
*   **Justificativa:** Um pico de CPU que durou 2 segundos não é um problema, mas um uso de 90% sustentado por 5 minutos é. Gráficos históricos são a única maneira de visualizar essa diferença crucial.
*   **Plano de Implementação Técnica:**
    1.  **Frontend (`index.js`):**
        *   Alterar o tipo dos gráficos no `Chart.js` de `'doughnut'` para `'line'`.
        *   A função `updateDashboard` agora irá adicionar um novo ponto de dado ao final do array `datasets.data` e remover o primeiro se o limite de pontos for atingido (ex: 120 pontos para 10 minutos com polling de 5s).
    2.  **Backend (`MetricsService.js`):**
        *   Não são necessárias grandes mudanças aqui, pois o serviço já envia os dados periodicamente. O frontend se encarregará de armazenar e exibir o histórico.

**2.2. Monitor de Serviços (Daemons)**

*   **Descrição:** Adicionar um novo card ou uma nova aba chamada "Serviços", onde o usuário pode especificar serviços para monitorar (ex: `nginx`, `mysql`, `docker`). O status (ativo/inativo/falhou) seria exibido e atualizado periodicamente.
*   **Justificativa:** Frequentemente, o problema em um servidor não é um recurso esgotado, mas um serviço crítico que parou de funcionar. Isso permite um diagnóstico proativo.
*   **Plano de Implementação Técnica:**
    1.  **Backend:**
        *   Adicionar um campo `monitoredServices: ['nginx', 'mysql']` ao `connections.json` para cada conexão.
        *   No `MetricsService.js`, ler esta lista e executar `systemctl is-active <service-name>` para cada serviço.
        *   Adicionar os status dos serviços ao payload de métricas enviado ao frontend.
    2.  **Frontend:**
        *   Criar a interface para exibir os serviços e seus status.
        *   No modal de edição/criação de conexão, adicionar um campo para o usuário listar os serviços que deseja monitorar.

---

#### **Fase 3: Qualidade de Vida e Automação**

*Objetivo: Polir a aplicação, tornando-a mais personalizável e adicionando recursos que economizam tempo em tarefas repetitivas.*

**3.1. Snippets de Comandos**

*   **Descrição:** Criar uma área (talvez uma nova aba na barra lateral) onde o usuário pode salvar scripts ou comandos usados com frequência. Um clique no snippet o executaria no terminal ativo.
*   **Justificativa:** Todo admin tem seu conjunto de comandos para "verificar tudo", "reiniciar a aplicação", "limpar cache", etc. Isso centraliza e acelera essas tarefas.
*   **Plano de Implementação Técnica:**
    *   Armazenar os snippets em um novo arquivo `snippets.json` ou dentro do `connections.json` (se forem por conexão).
    *   Criar a interface no frontend para listar, criar, editar e deletar snippets.
    *   Ao clicar, enviar o texto do snippet para o terminal ativo usando `ssm:terminal:write`.

**3.2. Indicadores de Status da Conexão**

*   **Descrição:** Adicionar um pequeno ponto colorido ao lado do nome de cada conexão na barra lateral para indicar seu status:
    *   **Verde:** Conectado e recebendo métricas.
    *   **Cinza:** Desconectado.
    *   **Vermelho:** Ocorreu um erro na conexão.
*   **Justificativa:** Fornece feedback visual imediato sobre a saúde das conexões, especialmente útil quando se tem muitas.
*   **Plano de Implementação Técnica:**
    *   No `index.js`, adicionar um elemento `<span>` para o ponto de status.
    *   Modificar a lógica de conexão (`updateUIForConnection`) e os listeners de eventos (`onMetricsUpdate`) para atualizar a classe CSS desse ponto com base no status.

Com este plano, você evoluirá o Crom-SSM de forma estruturada, entregando valor a cada fase e construindo uma ferramenta poderosa e coesa.