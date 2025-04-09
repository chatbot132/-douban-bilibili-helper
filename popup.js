document.addEventListener('DOMContentLoaded', function() {
    // 显示一个固定的状态信息
    updateStatus('豆瓣 B 站助手已激活', true);
});

// 更新状态显示
function updateStatus(message, isActive) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.style.marginTop = '10px';
    statusDiv.style.padding = '8px';
    statusDiv.style.borderRadius = '4px';
    statusDiv.style.fontSize = '13px';
    statusDiv.style.textAlign = 'center';
    
    if (isActive) {
        statusDiv.style.backgroundColor = '#e8f5e9';
        statusDiv.style.color = '#2e7d32';
    } else {
        statusDiv.style.backgroundColor = '#ffebee';
        statusDiv.style.color = '#c62828';
    }
    
    statusDiv.textContent = message;
    document.body.appendChild(statusDiv);
}

// // 添加设置按钮 (如果不需要可以注释掉或删除)
// const settingsButton = document.createElement('button');
// settingsButton.textContent = '设置';
// settingsButton.style.marginTop = '15px';
// settingsButton.style.padding = '8px 16px';
// settingsButton.style.backgroundColor = '#007722';
// settingsButton.style.color = 'white';
// settingsButton.style.border = 'none';
// settingsButton.style.borderRadius = '4px';
// settingsButton.style.cursor = 'pointer';
// settingsButton.style.width = '100%';

// settingsButton.addEventListener('click', function() {
//     // 打开设置页面
//     chrome.runtime.openOptionsPage();
// });

// document.body.appendChild(settingsButton); 