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

        return [
            `《${chineseTitle}》解说`,
            `《${chineseTitle}》 ${pageType} 解说`,
            `《${chineseTitle}》`
        ];
    }

    // 提取中文标题的函数
    function extractChineseTitle(title) {
        if (!title) return "";
        
        // 处理特殊情况：如果标题包含"第X季"这样的格式，并且后面跟着英文部分
        // 例如：《1923 第二季 1923 season2》应该只提取出《1923 第二季》
        const seasonPattern = /(.*?第[一二三四五六七八九十]+季)/;
        const seasonMatch = title.match(seasonPattern);
        
        if (seasonMatch && seasonMatch[1]) {
            // 检查匹配结果后面是否跟着英文部分
            const afterSeason = title.substring(seasonMatch[0].length);
            // 如果后面跟着的是英文部分（不包含中文字符），则只返回匹配到的部分
            if (afterSeason && !/[\u4e00-\u9fa5]/.test(afterSeason)) {
                return seasonMatch[1].trim();
            }
        }
        
        // 如果没有找到符合上述模式的部分，则使用原来的方法
        // 匹配所有中文字符（包括中文标点）和特殊符号
        const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uff60\·\…\—\～\？]+/g;
        const matches = title.match(chineseRegex);
        
        if (matches && matches.length > 0) {
            // 合并所有匹配结果
            return matches.join('').trim();
        }
        
        // 如果没有找到中文，返回原标题
        return title.trim();
    }

    let cachedVideos = []; // 存储所有视频
    let displayedVideos = new Set(); // 存储已展示过的视频ID
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
                searchBilibili(searchQueries[0]);
            }
        }
    }

    function searchBilibili(searchQuery) {
        if (!searchQuery) return;
        
        console.log("搜索关键词:", searchQuery);
        
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
                    // 过滤已展示的视频
                    const filteredVideos = filterDisplayedVideos(cachedVideos);
                    console.log(`过滤后视频数量: ${filteredVideos.length}/${cachedVideos.length}`);
                    
                    if (filteredVideos.length >= 3) {
                        // 如果过滤后仍有至少3个视频，则展示这些视频
                        insertBilibiliResults(filteredVideos.slice(0, 3), searchUrl, searchQuery);
                    } else if (filteredVideos.length > 0) {
                        // 如果过滤后不足3个视频，则使用未过滤的视频补足
                        const remainingCount = 3 - filteredVideos.length;
                        let additionalVideos = [];
                        
                        for (let i = 0; i < cachedVideos.length && additionalVideos.length < remainingCount; i++) {
                            if (!filteredVideos.includes(cachedVideos[i])) {
                                additionalVideos.push(cachedVideos[i]);
                            }
                        }
                        
                        const combinedVideos = [...filteredVideos, ...additionalVideos.slice(0, remainingCount)];
                        insertBilibiliResults(combinedVideos, searchUrl, searchQuery);
                    } else {
                        // 如果所有视频都已经展示过，则展示新的视频
                        insertBilibiliResults(cachedVideos.slice(0, 3), searchUrl, searchQuery);
                    }
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

    // 过滤已展示的视频
    function filterDisplayedVideos(videos) {
        return videos.filter(video => !displayedVideos.has(video.id));
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
        console.log("切换到搜索关键词:", nextQuery);
        
        // 使用新的搜索关键词重新搜索
        searchBilibili(nextQuery);
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
                currentQueryText.innerText = `当前：${currentKeyword}`;
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

                // 记录已展示的视频
                videos.forEach(video => {
                    displayedVideos.add(video.id);
                });

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
