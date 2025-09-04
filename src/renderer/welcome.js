document.addEventListener('DOMContentLoaded', () => {
    const enterButton = document.getElementById('enter-app-btn');
    if (enterButton) {
        enterButton.addEventListener('click', () => {
            window.ssm.enterApp();
        });
    }
});