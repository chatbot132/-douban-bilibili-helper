(function() {
    console.log("豆瓣 B 站解说插件已加载");

    // 获取页面类型（电影、电视剧、图书）
    function getPageType() {
        const url = window.location.href;
        if (url.includes('movie.douban.com')) return '电影';
        if (url.includes('book.douban.com')) return '图书';
        return '';
    }

    function getDoubanTitle() {
        let titleElement = document.querySelector("span[property='v:itemreviewed']") || document.querySelector("h1");
        return titleElement ? titleElement.innerText.trim() : null;
    }

    // 生成搜索关键词数组
    function generateSearchQueries(title, pageType) {
        if (!title) return [];
        
        // 提取中文标题
        const chineseTitle = extractChineseTitle(title);
        if (!chineseTitle) return [];

        console.log("原始标题:", title);
        console.log("提取后的中文标题:", chineseTitle);

        // 返回同时包含搜索关键词和显示关键词的对象数组
        return [
            {
                search: `《${chineseTitle}》解说`,
                display: chineseTitle
            },
            {
                search: `《${chineseTitle}》 ${pageType} 解说`,
                display: `${chineseTitle} ${pageType}`
            },
            {
                search: `《${chineseTitle}》`,
                display: chineseTitle
            }
        ];
    }

    // 提取中文标题的函数
    function extractChineseTitle(title) {
        if (!title) return "";
        console.log("提取标题，原始输入:", title);

        // 规则 1: 优先处理电视剧季度信息
        const seasonRegex = /第[一二三四五六七八九十]+季/;
        // 匹配从开头到第一个"第X季"的完整部分
        const seasonMatch = title.match(/(.*?第[一二三四五六七八九十]+季)/);
        if (seasonMatch && seasonMatch[1]) {
            const potentialTitle = seasonMatch[1].trim();
            console.log("提取结果 (规则1 - 季度模式):", potentialTitle);
            return potentialTitle; // 返回如 "1923 第二季" 或 "老友记 第十季"
        }

        // 规则 2: 处理电影标题 (提取到第一个空格为止，需含中文)
        const firstSpaceIndex = title.indexOf(' ');
        if (firstSpaceIndex > 0) {
            const firstPart = title.substring(0, firstSpaceIndex);
            // 检查提取的部分是否包含至少一个中文字符
            if (/[\u4e00-\u9fa5]/.test(firstPart)) {
                console.log("提取结果 (规则2 - 电影模式):", firstPart.trim());
                return firstPart.trim(); // 返回如 "千与千寻", "霸王别姬", "哆啦A梦："
            }
        }
        // 如果标题本身不含空格，但包含中文，也应用此逻辑
        if (firstSpaceIndex === -1 && /[\u4e00-\u9fa5]/.test(title)) {
             console.log("提取结果 (规则2 - 电影模式，无空格):", title.trim());
             return title.trim();
        }

        // 规则 3: 后备处理 - 提取所有中文字符、数字和特定标点
        const chineseRegex = /[\u4e00-\u9fa5\d《》：！，。（）？·]+/g;
        const matches = title.match(chineseRegex);
        if (matches && matches.length > 0) {
            const result = matches.join('').trim();
            console.log("提取结果 (规则3 - 后备中文提取):", result);
            return result;
        }

        // 规则 4: 最终后备 - 返回原始标题
        console.log("提取结果 (规则4 - 原始标题):", title.trim());
        return title.trim();
    }

    let cachedVideos = []; // 存储所有视频
    let currentIndex = 0; // 当前显示的起始索引
    let currentQueryIndex = 0; // 当前搜索关键词索引
    let searchQueries = []; // 存储搜索关键词数组
    let origTitle = null; // 原始标题

    // 初始化
    function init() {
        // 获取豆瓣标题
        origTitle = getDoubanTitle();
        if (origTitle) {
            const pageType = getPageType();
            searchQueries = generateSearchQueries(origTitle, pageType);
            if (searchQueries.length > 0) {
                console.log("生成的搜索关键词:", searchQueries);
                searchBilibili(searchQueries[0].search, searchQueries[0].display);
            }
        }
    }

    function searchBilibili(searchQuery, displayKeyword) {
        if (!searchQuery) return;
        
        console.log("搜索关键词:", searchQuery, "显示关键词:", displayKeyword);
        
        let searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(searchQuery)}&order=click`;

        chrome.runtime.sendMessage({ action: "fetchBilibili", url: searchUrl }, response => {
            if (response.success) {
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.html, "text/html");
                
                let videoElements = doc.querySelectorAll(".bili-video-card,.video-item");
                console.log("找到视频元素数量:", videoElements.length);

                cachedVideos = []; // 重置缓存
                currentIndex = 0; // 重置索引

                videoElements.forEach((el) => {
                    try {
                        let titleElement = el.querySelector(".bili-video-card__info--tit,.title,.info a");
                        let linkElement = el.querySelector("a[href*='bilibili.com/video']");
                        let authorElement = el.querySelector(".bili-video-card__info--author,.up-name,.up");
                        let viewsElement = el.querySelector(".bili-video-card__stats--item,.watch-num");
                        let thumbnailElement = el.querySelector(".bili-video-card__image img,.img img");

                        let videoUrl = "";
                        if (linkElement) {
                            videoUrl = linkElement.href || linkElement.getAttribute("href");
                            if (videoUrl && !videoUrl.startsWith("http")) {
                                videoUrl = "https:" + videoUrl;
                            }
                        }

                        let titleText = "";
                        if (titleElement) {
                            titleText = titleElement.getAttribute("title") || 
                                      titleElement.textContent.trim() ||
                                      titleElement.getAttribute("alt") ||
                                      "未知标题";
                        }

                        let thumbnailUrl = "";
                        if (thumbnailElement) {
                            thumbnailUrl = thumbnailElement.src || 
                                         thumbnailElement.getAttribute("src") ||
                                         thumbnailElement.getAttribute("data-src");
                        }

                        let views = "0";
                        if (viewsElement) {
                            views = viewsElement.textContent.trim();
                            if (!views.includes("万")) {
                                try {
                                    views = parseInt(views.replace(/[^0-9]/g, '')).toLocaleString();
                                } catch (e) {
                                    console.error("格式化播放量失败:", e);
                                }
                            }
                        }

                        if (videoUrl && titleText) {
                            // 提取视频ID用于跟踪已展示的视频
                            const videoId = extractVideoId(videoUrl);
                            
                            cachedVideos.push({
                                id: videoId,
                                title: titleText,
                                url: videoUrl,
                                author: authorElement ? authorElement.textContent.trim() : "未知作者",
                                views: views,
                                thumbnail: thumbnailUrl
                            });
                        }
                    } catch (error) {
                        console.error("处理视频元素时出错:", error);
                    }
                });

                if (cachedVideos.length > 0) {
                    // 直接展示前3个视频，无需过滤
                    insertBilibiliResults(cachedVideos.slice(0, 3), searchUrl, displayKeyword || searchQuery);
                } else {
                    console.log("未找到 B 站解说视频");
                    // 尝试下一个关键词
                    if (searchQueries.length > 1) {
                        switchToNextQuery();
                    }
                }
            } else {
                console.error("B 站搜索失败:", response.error);
            }
        });
    }

    // 从URL中提取视频ID
    function extractVideoId(url) {
        const match = url.match(/\/video\/([a-zA-Z0-9]+)/);
        return match ? match[1] : url;
    }

    // 切换到下一个搜索关键词
    function switchToNextQuery() {
        if (searchQueries.length === 0) return;
        
        currentQueryIndex = (currentQueryIndex + 1) % searchQueries.length;
        const nextQuery = searchQueries[currentQueryIndex];
        const searchTerm = nextQuery.search;
        const displayTerm = nextQuery.display;
        console.log("切换到搜索关键词:", searchTerm, "显示关键词:", displayTerm);
        
        // 使用新的搜索关键词重新搜索
        searchBilibili(searchTerm, displayTerm);
    }

    function insertBilibiliResults(videos, searchUrl, currentKeyword) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => doInsert());
        } else {
            doInsert();
        }

        function doInsert() {
            try {
                // 清除旧的推荐模块
                const oldModules = document.querySelectorAll(".bilibili-helper-container");
                oldModules.forEach(module => {
                    if (module && module.parentNode) {
                        module.parentNode.removeChild(module);
                    }
                });

                let container = document.createElement("div");
                container.className = "gray_ad bilibili-helper-container";
                container.id = "bilibili-helper-container";
                container.style.position = "relative";
                container.style.width = "100%";
                container.style.marginTop = "0";
                container.style.padding = "15px";
                container.style.backgroundColor = "#F4F4EC";
                container.style.border = "none";
                container.style.borderRadius = "0";
                container.style.boxSizing = "border-box";

                // 创建标题行容器
                let titleRow = document.createElement("div");
                titleRow.style.display = "flex";
                titleRow.style.justifyContent = "space-between";
                titleRow.style.alignItems = "center";
                titleRow.style.marginBottom = "15px";

                let title = document.createElement("h2");
                title.innerText = "b站相关视频推荐 ······";
                title.style.fontSize = "16px";
                title.style.color = "#007722";
                title.style.margin = "0";
                title.style.fontWeight = "normal";

                titleRow.appendChild(title);
                container.appendChild(titleRow);

                // 创建搜索词与换一换按钮行
                let infoRow = document.createElement("div");
                infoRow.style.display = "flex";
                infoRow.style.justifyContent = "space-between";
                infoRow.style.alignItems = "center";
                infoRow.style.marginBottom = "15px";

                // 添加当前关键词指示
                let currentQueryText = document.createElement("span");
                currentQueryText.innerText = `当前: ${currentKeyword}`;
                currentQueryText.style.fontSize = "12px";
                currentQueryText.style.color = "#999";

                // 添加换一换按钮
                let refreshButton = document.createElement("a");
                refreshButton.href = "javascript:void(0);";
                refreshButton.innerText = "换一换";
                refreshButton.style.fontSize = "13px";
                refreshButton.style.color = "#37a";
                refreshButton.style.textDecoration = "none";
                refreshButton.style.cursor = "pointer";
                refreshButton.style.backgroundColor = "transparent";
                refreshButton.addEventListener("mouseover", () => {
                    refreshButton.style.color = "#37a";
                });
                refreshButton.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    switchToNextQuery();
                    return false;
                });

                infoRow.appendChild(currentQueryText);
                infoRow.appendChild(refreshButton);
                container.appendChild(infoRow);

                // 创建视频容器
                let videoContainer = document.createElement("div");
                container.appendChild(videoContainer);

                // 插入视频项目
                insertVideoItems(videos, videoContainer);

                // 添加 "去 B 站查看更多" 按钮
                let moreLink = document.createElement("a");
                moreLink.href = searchUrl;
                moreLink.target = "_blank";
                moreLink.innerText = "去B站查看更多 >";
                moreLink.style.fontSize = "13px";
                moreLink.style.color = "#37a";
                moreLink.style.textDecoration = "none";
                moreLink.style.display = "block";
                moreLink.style.textAlign = "right";
                moreLink.style.marginTop = "10px";
                moreLink.style.paddingTop = "10px";
                moreLink.style.borderTop = "1px solid #e8e8e8";
                moreLink.style.backgroundColor = "transparent";
                moreLink.addEventListener("mouseover", () => {
                    moreLink.style.color = "#37a";
                });
                moreLink.onclick = (e) => {
                    e.preventDefault();
                    window.open(searchUrl, "_blank");
                };
                container.appendChild(moreLink);

                // 查找插入位置
                let sidebarModule = document.querySelector("#content .aside");
                if (!sidebarModule) {
                    console.warn("未找到右侧栏，等待100ms后重试");
                    setTimeout(() => doInsert(), 100);
                    return;
                }

                // 查找或创建目标区域
                let movieSourcesSection = document.querySelector("#bilibili-helper-section");
                if (!movieSourcesSection) {
                    movieSourcesSection = document.createElement("div");
                    movieSourcesSection.id = "bilibili-helper-section";
                    sidebarModule.insertBefore(movieSourcesSection, sidebarModule.firstChild);
                }

                // 清空旧内容
                while (movieSourcesSection.firstChild) {
                    movieSourcesSection.removeChild(movieSourcesSection.firstChild);
                }

                // 将容器插入到区域的最顶部
                movieSourcesSection.appendChild(container);
            } catch (error) {
                console.error("插入B站解说模块时出错:", error);
            }
        }
    }

    // 辅助函数：插入视频项目
    function insertVideoItems(videos, container) {
        videos.forEach((video, index) => {
            if (!video || !video.url) return;

            let videoItem = document.createElement("div");
            videoItem.style.marginBottom = "15px";
            videoItem.style.backgroundColor = "white";
            videoItem.style.borderRadius = "4px";
            videoItem.style.overflow = "hidden";
            videoItem.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

            // 创建缩略图容器
            let thumbnailContainer = document.createElement("div");
            thumbnailContainer.style.position = "relative";
            thumbnailContainer.style.width = "100%";
            thumbnailContainer.style.paddingTop = "56.25%"; // 16:9 比例
            thumbnailContainer.style.backgroundColor = "#f5f5f5";
            thumbnailContainer.style.overflow = "hidden";

            // 添加缩略图
            let thumbnail = document.createElement("img");
            thumbnail.src = video.thumbnail || "default-thumbnail.png";
            thumbnail.style.position = "absolute";
            thumbnail.style.top = "0";
            thumbnail.style.left = "0";
            thumbnail.style.width = "100%";
            thumbnail.style.height = "100%";
            thumbnail.style.objectFit = "cover";
            thumbnailContainer.appendChild(thumbnail);

            // 创建视频信息容器
            let infoContainer = document.createElement("div");
            infoContainer.style.padding = "10px";

            // 添加标题
            let title = document.createElement("div");
            title.textContent = video.title;
            title.style.fontSize = "14px";
            title.style.fontWeight = "bold";
            title.style.marginBottom = "5px";
            title.style.color = "#333";
            title.style.display = "-webkit-box";
            title.style.webkitLineClamp = "2";
            title.style.webkitBoxOrient = "vertical";
            title.style.overflow = "hidden";
            infoContainer.appendChild(title);

            // 添加作者和播放量信息
            let metaInfo = document.createElement("div");
            metaInfo.style.fontSize = "12px";
            metaInfo.style.color = "#666";
            metaInfo.style.display = "flex";
            metaInfo.style.justifyContent = "space-between";
            metaInfo.style.alignItems = "center";

            let author = document.createElement("span");
            author.textContent = video.author;
            author.style.maxWidth = "60%";
            author.style.overflow = "hidden";
            author.style.textOverflow = "ellipsis";
            author.style.whiteSpace = "nowrap";

            let views = document.createElement("span");
            views.textContent = `${video.views} 播放`;
            views.style.marginLeft = "10px";

            metaInfo.appendChild(author);
            metaInfo.appendChild(views);
            infoContainer.appendChild(metaInfo);

            // 组装视频项目
            videoItem.appendChild(thumbnailContainer);
            videoItem.appendChild(infoContainer);

            // 添加点击事件
            videoItem.style.cursor = "pointer";
            videoItem.addEventListener("click", () => {
                window.open(video.url, "_blank");
            });

            container.appendChild(videoItem);
        });
    }

    // 初始化
    init();
})();
