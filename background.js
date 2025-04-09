// 重试配置
const RETRY_CONFIG = {
    maxRetries: 3,
    delayMs: 1000,
    backoffFactor: 2
};

// 错误处理函数
function handleError(error, retryCount = 0) {
    console.error(`错误 (尝试 ${retryCount + 1}/${RETRY_CONFIG.maxRetries}):`, error);
    
    // 如果还有重试机会，则延迟后重试
    if (retryCount < RETRY_CONFIG.maxRetries) {
        const delay = RETRY_CONFIG.delayMs * Math.pow(RETRY_CONFIG.backoffFactor, retryCount);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // 超过重试次数，返回错误信息
    return Promise.reject({
        message: '获取数据失败，请稍后重试',
        originalError: error.message
    });
}

// 发送通知
function sendNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchBilibili") {
        let retryCount = 0;
        
        function attemptFetch() {
            fetch(request.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(data => {
                console.log("成功获取B站搜索结果");
                sendResponse({ success: true, html: data });
            })
            .catch(error => {
                return handleError(error, retryCount)
                    .then(() => {
                        retryCount++;
                        return attemptFetch();
                    })
                    .catch(finalError => {
                        console.error("获取B站搜索结果失败:", finalError);
                        sendNotification(
                            "获取数据失败",
                            "无法获取B站数据，请检查网络连接或稍后重试"
                        );
                        sendResponse({ 
                            success: false, 
                            error: finalError.message,
                            retryCount: retryCount
                        });
                    });
            });
        }
        
        attemptFetch();
        return true; // 保持消息通道打开
    }
});
