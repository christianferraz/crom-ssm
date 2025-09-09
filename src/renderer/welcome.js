document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado');
    console.log('window.ssm disponível?', !!window.ssm);
    console.log('window.ssm.enterApp disponível?', !!window.ssm?.enterApp);
    
    const enterButton = document.getElementById('enter-app-btn');
    console.log('Botão encontrado?', !!enterButton);
    if (enterButton) {
        enterButton.addEventListener('click', () => {
            window.ssm.enterApp();
        });
    }
});