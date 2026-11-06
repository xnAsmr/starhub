/**
 * 星枢 · 个人工作台 - 交互逻辑
 * 版本: V4.0
 */

(function() {
  'use strict';
  
  // DOM 元素
  const searchBox = document.getElementById('searchBox');
  const contentArea = document.getElementById('content');
  const themeToggle = document.getElementById('themeToggle');
  const footerArea = document.getElementById('footer');
  const headerTitle = document.querySelector('.header-title');
  const headerSubtitle = document.querySelector('.header-subtitle');
  const calendarMonth = document.getElementById('calendarMonth');
  const calendarDays = document.getElementById('calendarDays');
  const calendarTodayBtn = document.getElementById('calendarTodayBtn');
  const eventsList = document.getElementById('eventsList');
  const prevMonth = document.getElementById('prevMonth');
  const nextMonth = document.getElementById('nextMonth');
  const settingsBtn = document.getElementById('settingsBtn');
  const cycleSettings = document.getElementById('cycleSettings');
  const cycleName = document.getElementById('cycleName');
  const startDate = document.getElementById('startDate');
  const periodDays = document.getElementById('periodDays');
  const saveCycle = document.getElementById('saveCycle');
  const cancelCycle = document.getElementById('cancelCycle');
  const savedCycles = document.getElementById('savedCycles');
  const eventsPanel = document.getElementById('eventsPanel');
  const eventsHeader = document.getElementById('eventsHeader');
  const collapseBtn = document.getElementById('collapseBtn');
  const searchStats = document.getElementById('searchStats');
  const quickLinks = document.getElementById('quickLinks');
  const groupNav = document.getElementById('groupNav');
  const backTop = document.getElementById('backTop');
  const videoPlayer = document.getElementById('videoPlayer');
  const videoLoading = document.getElementById('videoLoading');
  const videoPlayOverlay = document.getElementById('videoPlayOverlay');
  const videoRefreshBtn = document.getElementById('videoRefreshBtn');
  const videoImmersiveBtn = document.getElementById('videoImmersiveBtn');
  const videoContainer = document.getElementById('videoContainer');
  const videoLock = document.getElementById('videoLock');
  const videoLockInput = document.getElementById('videoLockInput');
  const videoLockTip = document.getElementById('videoLockTip');
  const immersiveOverlay = document.getElementById('immersiveOverlay');
  const immersiveStage = document.getElementById('immersiveStage');
  const immersiveRefreshBtn = document.getElementById('immersiveRefreshBtn');
  const immersiveCloseBtn = document.getElementById('immersiveCloseBtn');
  
  // 视频接口
  const VIDEO_API = 'https://api.yujn.cn/api/zzxjj.php?type=video';

  // 视频观看口令（从 sites.json 的 video.passcodes 读取，支持多个）
  const VIDEO_UNLOCK_KEY = 'starhub-video-unlocked';
  let videoPasscodes = [];
  let videoConfigReady = false;
  
  // 数据存储
  let sitesData = null;
  let calendarData = { cycles: [], events: [] };
  let userCycles = [];
  let editCycleIndex = -1; // 正在编辑的周期索引，-1 表示新增
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let videoPausedByVisibility = false; // 标签页切走导致的暂停标记
  let selectedDate = null; // 农历查询选中的日期（null = 显示今天）
  
  // 本地存储键名
  const STORAGE_KEY = 'starhub-cycles';
  const COLLAPSE_KEY = 'starhub-events-collapsed';
  const FAVORITES_KEY = 'starhub-favorites';
  const CYCLE_SYNC_KEY = 'starhub-cycle-sync';
  
  // 默认周期配置
  const DEFAULT_CYCLE = {
    id: 1,
    name: '默认周期',
    startDate: '2026-11-01',
    periodDays: 15,
    colors: ['#4080FF', '#22C55E']
  };
  
  /**
   * 初始化
   */
  function init() {
    loadTheme();
    loadUserCycles();
    loadCollapseState();
    loadSites();
    bindEvents();
    // 不自动播放：进站仅显示封面，用户点击后才开始加载
  }
  
  /**
   * 是否已通过口令解锁（本次会话有效）
   */
  function isVideoUnlocked() {
    try {
      return sessionStorage.getItem(VIDEO_UNLOCK_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  
  /**
   * 标记本次会话已解锁
   */  
  function markVideoUnlocked() {
    try {
      sessionStorage.setItem(VIDEO_UNLOCK_KEY, '1');
    } catch (e) {
      // 隐私模式下 sessionStorage 不可用，忽略即可
    }
  }
  
  /**
   * 归一化口令配置：支持数组 / 逗号分隔字符串 / 单个字符串
   */
  function normalizePasscodes(cfg) {
    if (!cfg) return [];
    const raw = cfg.passcodes !== undefined ? cfg.passcodes : cfg.passcode;
    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      list = raw.split(',');
    }
    return list
      .map(function(item) {
        return String(item == null ? '' : item).trim();
      })
      .filter(function(item) {
        return item.length > 0;
      });
  }
  
  /**
   * 应用 sites.json 中的 video 配置（口令 / 文案）
   */
  function applyVideoConfig(cfg) {
    videoPasscodes = normalizePasscodes(cfg);
    videoConfigReady = true;
    
    // 文案可自定义
    if (cfg && cfg.lockTitle) {
      const titleEl = document.querySelector('.vl-title');
      if (titleEl) titleEl.textContent = cfg.lockTitle;
    }
    if (cfg && cfg.unlockHint && videoLockTip) {
      videoLockTip.textContent = cfg.unlockHint;
    }
    
    // 未配置口令或本会话已解锁：直接展示播放入口
    if (!videoPasscodes.length || isVideoUnlocked()) {
      hideVideoLock();
      if (videoPlayOverlay) videoPlayOverlay.classList.remove('hidden');
      return;
    }
    
    // 已配置口令且未解锁：直接上锁
    showVideoLock(false);
  }
  
  /**
   * 展示口令面板（shouldFocus 为 false 时不自动聚焦，避免移动端弹键盘）
   */
  function showVideoLock(shouldFocus) {
    if (!videoLock) return;
    videoLock.classList.remove('hidden', 'shake');
    videoLockTip.classList.add('hidden');
    if (videoPlayOverlay) videoPlayOverlay.classList.add('hidden');
    videoLockInput.value = '';
    if (shouldFocus === false) return;
    setTimeout(function() {
      videoLockInput.focus({ preventScroll: true });
    }, 60);
  }
  
  /**
   * 隐藏口令面板
   */
  function hideVideoLock() {
    if (!videoLock) return;
    videoLock.classList.add('hidden');
    videoLock.classList.remove('shake');
  }
  
  /**
   * 加载视频（接入遇见API随机视频）
   */
  function loadVideo() {
    if (!videoPlayer) return;
    videoLoading.classList.remove('hidden');
    videoLoading.textContent = '加载中...';
    // 加时间戳防止缓存，确保每次换新视频
    videoPlayer.src = VIDEO_API + '&t=' + Date.now();
    videoPlayer.load();
    videoPlayer.play().catch(function() {
      // 自动播放被拦截时静默失败
    });
  }
  
  /**
   * 用户主动开始播放（封面点击 / 换一个 / 进入沉浸）：隐藏封面并有声播放
   */
  function startVideoPlayback() {
    // 口令配置尚未就绪时先不处理，避免绕过校验
    if (!videoConfigReady) return;
    // 已配置口令且未通过校验：先弹出口令面板
    if (videoPasscodes.length && !isVideoUnlocked()) {
      showVideoLock();
      return;
    }
    hideVideoLock();
    if (videoPlayOverlay) videoPlayOverlay.classList.add('hidden');
    videoPlayer.muted = false;
    loadVideo();
  }
  
  /**
   * 视频加载完成回调
   */
  function onVideoReady() {
    videoLoading.classList.add('hidden');
    if (videoPlayOverlay) videoPlayOverlay.classList.add('hidden');
  }
  
  /**
   * 视频加载失败回调
   */
  function onVideoError() {
    videoLoading.classList.remove('hidden');
    videoLoading.textContent = '加载失败，点击重试';
    videoLoading.style.pointerEvents = 'auto';
    videoLoading.style.cursor = 'pointer';
  }
  
  /**
   * 进入沉浸模式（视频容器整体移入全屏层，播放不中断）
   */
  function enterImmersive() {
    immersiveStage.appendChild(videoContainer);
    immersiveOverlay.style.display = 'flex';
    document.body.classList.add('immersive-active');
    // 进入沉浸即明确观看意图：未加载则开始加载，已加载则续播
    if (!videoPlayer.src) {
      startVideoPlayback();
    } else {
      videoPlayer.play().catch(function() {});
    }
  }
  
  /**
   * 退出沉浸模式（视频容器移回右栏原位）
   */
  function exitImmersive() {
    const panel = document.querySelector('.video-panel');
    if (panel && videoContainer.parentElement !== panel) {
      panel.appendChild(videoContainer);
    }
    immersiveOverlay.style.display = 'none';
    document.body.classList.remove('immersive-active');
    videoPlayer.play().catch(function() {});
  }
  
  /**
   * 是否处于沉浸模式
   */
  function isImmersive() {
    return document.body.classList.contains('immersive-active');
  }
  
  /**
   * 加载主题设置
   */
  function loadTheme() {
    const savedTheme = localStorage.getItem('starhub-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
  }
  
  /**
   * 更新主题图标
   */
  function updateThemeIcon(theme) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  
  /**
   * 切换主题
   */
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('starhub-theme', newTheme);
    updateThemeIcon(newTheme);
  }
  
  /**
   * 默认周期指纹：起始日期 / 周期天数 / 颜色 任一变动就会重新同步
   */
  function getDefaultCycleSignature() {
    return [
      DEFAULT_CYCLE.startDate,
      DEFAULT_CYCLE.periodDays,
      (DEFAULT_CYCLE.colors || []).join('-')
    ].join('|');
  }
  
  /**
   * 将服务器上的最新默认周期刷入本地存储
   * 老用户打开网站即可拿到最新周期；同一指纹只同步一次，
   * 同步后用户再自行修改不会被反复覆盖
   */
  function syncDefaultCycle() {
    const signature = getDefaultCycleSignature();
    let synced = null;
    try {
      synced = localStorage.getItem(CYCLE_SYNC_KEY);
    } catch (e) {
      return false;
    }
    if (synced === signature) return false;
    
    const fresh = JSON.parse(JSON.stringify(DEFAULT_CYCLE));
    const index = userCycles.findIndex(function(cycle) {
      return cycle && (cycle.id === DEFAULT_CYCLE.id || cycle.name === DEFAULT_CYCLE.name);
    });
    
    if (index !== -1) {
      // 存在默认周期：直接刷新为最新配置
      userCycles[index] = fresh;
    } else {
      // 用户已自行删除默认周期：补到开头，不改变当前生效的周期（取末尾一条）
      userCycles.unshift(fresh);
    }
    
    try {
      localStorage.setItem(CYCLE_SYNC_KEY, signature);
    } catch (e) {
      console.error('Failed to record cycle sync signature:', e);
    }
    return true;
  }
  
  /**
   * 加载用户自定义周期
   */
  function loadUserCycles() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        userCycles = JSON.parse(saved);
        // 确保是数组
        if (!Array.isArray(userCycles)) {
          userCycles = [DEFAULT_CYCLE];
          saveUserCycles();
        } else if (syncDefaultCycle()) {
          // 用服务器上的最新默认周期覆盖本地旧数据
          saveUserCycles();
        }
      } else {
        // 无保存数据时应用默认周期
        userCycles = [DEFAULT_CYCLE];
        saveUserCycles();
        syncDefaultCycle();
      }
    } catch (e) {
      console.error('Failed to load cycles:', e);
      userCycles = [DEFAULT_CYCLE];
    }
  }
  
  /**
   * 保存用户自定义周期
   */
  function saveUserCycles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userCycles));
    } catch (e) {
      console.error('Failed to save cycles:', e);
    }
  }
  
  /**
   * 获取所有周期（合并默认和用户自定义）
   */
  function getAllCycles() {
    // 单一周期：优先使用用户自定义周期，其次使用配置周期（仅取第一个）
    if (userCycles.length > 0) {
      return [userCycles[userCycles.length - 1]];
    }
    
    if (calendarData.cycles && calendarData.cycles.length > 0) {
      return [calendarData.cycles[0]];
    }
    
    return [];
  }
  
  /**
   * 加载站点数据
   */
  async function loadSites() {
    try {
      const response = await fetch('sites.json?' + Date.now());
      if (!response.ok) {
        throw new Error('Failed to load sites data');
      }
      sitesData = await response.json();
      
      // 渲染站点信息
      if (sitesData.site) {
        renderSiteInfo(sitesData.site);
      }
      
      // 渲染分组
      renderGroups(sitesData.groups);
      
      // 渲染备用站点卡片
      renderBackupSite(sitesData.backup);
      
      // 渲染分组锚点导航
      renderGroupNav(sitesData.groups);
      
      // 渲染常用快捷置顶
      renderQuickLinks(sitesData.groups);
      
      // 渲染搜索统计
      updateSearchStats();
      
      // 渲染页脚
      if (sitesData.footer) {
        renderFooter(sitesData.footer, sitesData.backup);
      }
      
      // 加载日历数据
      if (sitesData.calendar) {
        calendarData.events = sitesData.calendar.events || [];
        calendarData.cycles = sitesData.calendar.cycles || [];
      }
      
      // 应用视频口令配置（来自 sites.json 的 video 节点）
      applyVideoConfig(sitesData.video);
      
      renderCalendar();
      renderEvents();
      renderSavedCycles();
    } catch (error) {
      console.error('Error loading sites:', error);
      contentArea.innerHTML = '<div class="no-results">数据加载失败，请刷新重试</div>';
      // 配置读取失败时不阻断视频
      applyVideoConfig(null);
    }
  }
  
  /**
   * 渲染站点信息
   */
  function renderSiteInfo(site) {
    if (site.title) {
      headerTitle.textContent = site.title;
      document.title = site.title + ' | 工作台导航';
    }
    if (site.subtitle) {
      headerSubtitle.textContent = site.subtitle;
    }
    if (site.searchPlaceholder) {
      searchBox.placeholder = site.searchPlaceholder;
    }
  }
  
  /**
   * 渲染分组
   */
  function renderGroups(groups) {
    contentArea.innerHTML = '';
    
    if (!groups || groups.length === 0) {
      contentArea.innerHTML = '<div class="no-results">暂无数据</div>';
      return;
    }
    
    groups.forEach(function(group) {
      if (!group.items || group.items.length === 0) {
        return;
      }
      
      const groupElement = document.createElement('div');
      groupElement.className = 'group';
      groupElement.setAttribute('data-group', group.name);
      
      const titleElement = document.createElement('h2');
      titleElement.className = 'group-title';
      titleElement.textContent = group.name;
      groupElement.appendChild(titleElement);
      
      const gridElement = document.createElement('div');
      gridElement.className = 'cards-grid';
      
      group.items.forEach(function(item) {
        const card = createCard(item);
        gridElement.appendChild(card);
      });
      
      groupElement.appendChild(gridElement);
      contentArea.appendChild(groupElement);
    });
  }
  
  /**
   * 创建卡片元素
   */
  function createCard(item) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = item.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('data-title', item.title);
    
    // 判断图标类型：图片文件使用 img 标签，否则使用 emoji
    const iconContent = isImageFile(item.icon) 
      ? '<img src="' + escapeHtml(item.icon) + '" alt="' + escapeHtml(item.title) + '" class="card-icon-img">'
      : escapeHtml(item.icon);
    
    card.innerHTML = 
      '<div class="card-icon">' + iconContent + '</div>' +
      '<div class="card-info">' +
        '<div class="card-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="card-desc">' + escapeHtml(item.desc) + '</div>' +
      '</div>';
    
    // 记录访问次数
    card.addEventListener('click', function() {
      recordVisit(item.title);
    });
    
    return card;
  }
  
  /**
   * 判断是否为图片文件
   */
  function isImageFile(path) {
    return /\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(path);
  }
  
  /**
   * 判断目标地址是否与当前站点同源（镜像上不重复展示备用入口）
   */
  function isSameSite(url) {
    try {
      return new URL(url, location.href).host === location.host;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * 选定备用站点卡片的落位：优先指定分组，否则首个分组
   */
  function pickBackupGrid(groupName) {
    const groups = contentArea.querySelectorAll('.group');
    if (groups.length === 0) return null;
    
    let target = null;
    if (groupName) {
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].getAttribute('data-group') === groupName) {
          target = groups[i];
          break;
        }
      }
    }
    if (!target) target = groups[0];
    
    return target.querySelector('.cards-grid');
  }
  
  /**
   * 渲染备用站点卡片（配置来自 sites.json 的 backup 节点）
   */
  function renderBackupSite(backup) {
    if (!backup || !backup.url || !backup.title) return;
    if (isSameSite(backup.url)) return;
    
    const grid = pickBackupGrid(backup.group);
    if (!grid) return;
    
    const card = createCard({
      title: backup.title,
      url: backup.url,
      desc: backup.desc || '主站异常时的备用入口',
      icon: backup.icon || '🛰️'
    });
    card.classList.add('card--backup');
    
    const titleElement = card.querySelector('.card-title');
    if (titleElement) {
      titleElement.insertAdjacentHTML('beforeend', '<span class="card-tag">' + escapeHtml(backup.tag || '备用') + '</span>');
    }
    
    grid.appendChild(card);
  }
  
  /**
   * HTML 转义
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * 渲染分组锚点导航
   */
  function renderGroupNav(groups) {
    if (!groupNav) return;
    
    if (!groups || groups.length === 0) {
      groupNav.style.display = 'none';
      return;
    }
    
    let html = '<div class="group-nav-title">📂 快捷导航</div>';
    html += '<div class="group-nav-list">';
    
    groups.forEach(function(group, index) {
      if (!group.items || group.items.length === 0) return;
      
      const count = group.items.length;
      html += 
        '<button class="group-nav-item" data-nav-index="' + index + '">' +
          '<span>' + escapeHtml(group.name) + '</span>' +
          '<span class="gn-count">' + count + '</span>' +
        '</button>';
    });
    
    // 移动端快捷入口：热门视频（在 CSS 中控制仅移动端显示）
    html +=
      '<button class="group-nav-item gn-video" data-nav-target="video">' +
        '<span>🎬 热门视频</span>' +
        '<span class="gn-count">▶</span>' +
      '</button>';
    
    html += '</div>';
    groupNav.innerHTML = html;
    groupNav.style.display = 'block';
    
    // 绑定点击滚动
    groupNav.querySelectorAll('.group-nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const target = this.getAttribute('data-nav-target');
        if (target === 'video') {
          scrollToVideo();
          return;
        }
        const index = parseInt(this.getAttribute('data-nav-index'));
        scrollToGroup(index);
      });
    });
  }
  
  /**
   * 滚动到视频区（移动端快捷导航入口）
   */
  function scrollToVideo() {
    const sidebar = document.getElementById('videoSidebar');
    if (sidebar) {
      sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  /**
   * 滚动到指定分组
   */
  function scrollToGroup(index) {
    const groups = contentArea.querySelectorAll('.group');
    if (groups[index]) {
      groups[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  /**
   * 渲染常用站点快捷置顶
   */
  function renderQuickLinks(groups) {
    if (!quickLinks) return;
    
    // 获取访问记录
    let favorites = [];
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        favorites = JSON.parse(saved);
      }
    } catch (e) {
      favorites = [];
    }
    
    // 只保留有记录的
    if (!favorites || favorites.length === 0) {
      quickLinks.style.display = 'none';
      return;
    }
    
    // 按访问次数排序，取前6个
    favorites.sort(function(a, b) {
      return b.count - a.count;
    });
    
    const topFavorites = favorites.slice(0, 6);
    
    // 从站点数据中查找对应条目
    const allItems = [];
    groups.forEach(function(group) {
      if (group.items) {
        group.items.forEach(function(item) {
          allItems.push(item);
        });
      }
    });
    
    let html = '<span class="quick-links-title">⚡ 常用</span>';
    
    topFavorites.forEach(function(fav) {
      const item = allItems.find(function(i) {
        return i.title === fav.title;
      });
      
      if (item) {
        const iconContent = isImageFile(item.icon) 
          ? '<img src="' + escapeHtml(item.icon) + '" alt="" class="ql-icon-img">'
          : '<span class="ql-icon">' + escapeHtml(item.icon) + '</span>';
        
        html += 
          '<a class="quick-link" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' +
            iconContent +
            '<span>' + escapeHtml(item.title) + '</span>' +
          '</a>';
      }
    });
    
    quickLinks.innerHTML = html;
    quickLinks.style.display = 'flex';
  }
  
  /**
   * 记录站点访问
   */
  function recordVisit(title) {
    let favorites = [];
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        favorites = JSON.parse(saved);
      }
    } catch (e) {
      favorites = [];
    }
    
    const existing = favorites.find(function(f) {
      return f.title === title;
    });
    
    if (existing) {
      existing.count++;
      existing.lastVisit = Date.now();
    } else {
      favorites.push({
        title: title,
        count: 1,
        lastVisit: Date.now()
      });
    }
    
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) {
      // 忽略存储异常
    }
    
    // 刷新快捷置顶
    if (sitesData && sitesData.groups) {
      renderQuickLinks(sitesData.groups);
    }
  }
  
  function renderFooter(footer, backup) {
    if (!footerArea) return;
    
    let html = '<p class="footer-text">';
    
    // ICP备案
    if (footer.icp && footer.icp.text) {
      html += '<a href="' + escapeHtml(footer.icp.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(footer.icp.text) + '</a>';
    }
    
    // 公安备案
    if (footer.security && footer.security.text) {
      if (html.length > 0 && html.indexOf(footer.icp.text) !== -1) html += ' <span class="footer-sep">|</span> ';
      html += '<a href="' + escapeHtml(footer.security.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(footer.security.text) + '</a>';
    }
    
    html += '</p>';
    
    // 备用站点入口（当前已是镜像站时不展示）
    if (backup && backup.url && !isSameSite(backup.url)) {
      html += '<p class="footer-backup"><a href="' + escapeHtml(backup.url) + '" target="_blank" rel="noopener noreferrer">'
        + escapeHtml(backup.icon || '🛰️') + '<span>' + escapeHtml(backup.footerText || '备用站点') + '</span></a></p>';
    }
    
    // 版权信息
    if (footer.copyright) {
      html += '<p class="footer-meta">' + escapeHtml(footer.copyright) + '</p>';
    }
    
    // 页面加载耗时
    html += '<p class="footer-meta">' + '页面加载耗时 ' + getPageLoadTime() + '</p>';
    
    footerArea.innerHTML = html;
  }
  
  /**
   * 计算页面加载耗时
   */
  function getPageLoadTime() {
    if (window.performance && window.performance.timing) {
      const navStart = window.performance.timing.navigationStart;
      const loadEnd = window.performance.timing.loadEventEnd;
      if (loadEnd > navStart) {
        return ((loadEnd - navStart) / 1000).toFixed(2) + 's';
      }
    }
    return '—';
  }
  
  /**
   * 搜索过滤
   */
  function filterSites(query) {
    if (!sitesData || !sitesData.groups) {
      return;
    }
    
    const normalizedQuery = query.toLowerCase().trim();
    const groups = contentArea.querySelectorAll('.group');
    
    groups.forEach(function(group) {
      const cards = group.querySelectorAll('.card');
      let hasVisibleCard = false;
      
      cards.forEach(function(card) {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const desc = card.querySelector('.card-desc').textContent.toLowerCase();
        
        if (!normalizedQuery || title.includes(normalizedQuery) || desc.includes(normalizedQuery)) {
          card.style.display = 'flex';
          hasVisibleCard = true;
        } else {
          card.style.display = 'none';
        }
      });
      
      // 隐藏空分组
      if (hasVisibleCard) {
        group.classList.remove('hidden');
      } else {
        group.classList.add('hidden');
      }
    });
    
    // 显示无结果提示
    const visibleGroups = contentArea.querySelectorAll('.group:not(.hidden)');
    let noResults = contentArea.querySelector('.no-results');
    
    if (visibleGroups.length === 0 && normalizedQuery) {
      if (!noResults) {
        noResults = document.createElement('div');
        noResults.className = 'no-results';
        contentArea.appendChild(noResults);
      }
      noResults.textContent = '未找到匹配的站点';
      noResults.style.display = 'block';
    } else if (noResults) {
      noResults.style.display = 'none';
    }
    
    // 更新搜索统计
    updateSearchStats();
  }
  
  /**
   * 更新搜索统计
   */
  function updateSearchStats() {
    if (!searchStats) return;
    
    const query = searchBox.value.trim();
    const allCards = contentArea.querySelectorAll('.card');
    let visibleCount = 0;
    
    allCards.forEach(function(card) {
      if (card.style.display !== 'none') {
        visibleCount++;
      }
    });
    
    if (query) {
      searchStats.textContent = '找到 ' + visibleCount + ' 个匹配站点';
    } else {
      searchStats.textContent = '共 ' + allCards.length + ' 个站点';
    }
  }
  
  /**
   * 计算某日期在周期中的位置
   */
  function getCycleDayInfo(date, startDate, periodDays, colors) {
    const start = new Date(startDate);
    const target = new Date(date);
    
    // 设置时间为当天的开始
    start.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((target - start) / (1000 * 60 * 60 * 24));
    
    // 如果日期在起始日期之前，返回 null
    if (diffDays < 0) return null;
    
    // 颜色块交替：每 periodDays 天为一个块，块之间两种颜色交替
    const blockIndex = Math.floor(diffDays / periodDays);
    const colorIndex = blockIndex % 2;
    const color = colors[colorIndex] || (colorIndex === 0 ? '#4080FF' : '#22C55E');
    
    return {
      day: (diffDays % periodDays) + 1, // 周期内的第几天（从1开始）
      block: blockIndex,
      color: color,
      totalDays: periodDays
    };
  }
  
  /**
   * 渲染日历
   */
  function renderCalendar() {
    // 更新月份标题
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    calendarMonth.textContent = currentYear + '年 ' + monthNames[currentMonth];
    
    // 计算日历数据
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();
    
    // 渲染日历格子
    let html = '';
    
    function renderDay(day, date, isOtherMonth) {
      const cycleInfo = getDayCycleInfo(date);
      let classes = 'calendar-day' + (isOtherMonth ? ' other-month' : '');
      let style = '';
      
      if (isToday(date)) {
        classes += ' today';
      }
      
      if (selectedDate && sameDate(selectedDate, date)) {
        classes += ' selected';
      }
      
      if (hasEventOnDate(date)) {
        classes += ' has-event';
      }
      
      if (cycleInfo) {
        classes += ' cycle-day';
        // 叠加其他周期颜色的柔和背景
        const softBg = hexToRgba(cycleInfo.color, 0.15);
        style = '--cycle-color: ' + cycleInfo.color + '; --cycle-soft-bg: ' + softBg + ';';
      }
      
      const lunarText = getLunarStr(date.getFullYear(), date.getMonth() + 1, date.getDate());
      let title = '农历' + lunarText;
      if (cycleInfo) {
        title += ' · ' + cycleInfo.name + ' 第' + cycleInfo.day + '天';
      }
      
      return '<div class="' + classes + '" style="' + style +
        '" data-date="' + date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() +
        '" title="' + title + '">' + day + '</div>';
    }
    
    function isToday(date) {
      return date.getFullYear() === todayYear && date.getMonth() === todayMonth && date.getDate() === todayDate;
    }
    
    // 上个月的日期
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const date = new Date(currentYear, currentMonth - 1, day);
      html += renderDay(day, date, true);
    }
    
    // 当月的日期
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      html += renderDay(day, date, false);
    }
    
    // 下个月的日期
    const totalCells = firstDay + daysInMonth;
    const remainingDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(currentYear, currentMonth + 1, i);
      html += renderDay(i, date, true);
    }
    
    calendarDays.innerHTML = html;
    
    // 渲染周期图例
    renderCycleLegend();
  }
  
  /**
   * 判断日期是否有事件
   */
  function hasEventOnDate(date) {
    if (!calendarData.events || calendarData.events.length === 0) return false;
    
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    
    return calendarData.events.some(function(event) {
      const ed = new Date(event.date);
      return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
    });
  }
  
  /**
   * 渲染周期图例（今日/选中日期的公历 + 干支 + 农历信息）
   */
  function renderCycleLegend() {
    const legendEl = document.getElementById('cycleLegend');
    if (!legendEl) return;
    
    const target = selectedDate || new Date();
    const y = target.getFullYear();
    const m = target.getMonth() + 1;
    const d = target.getDate();
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    const solarStr = y + '/' + pad2(m) + '/' + pad2(d);
    const lunarInfo = solar2lunar(y, m, d);
    const lunarText = getLunarStr(y, m, d);
    const gz = ganzhiStr(lunarInfo.year);
    
    let html = '<div class="legend-lunar">📅 ' + solarStr +
      ' · <span class="lunar-date">' + gz + ' · 农历' + lunarText + '</span>';
    if (selectedDate) {
      html += '<a class="lunar-reset" id="lunarResetBtn" href="javascript:;">回到今天</a>';
    } else {
      html += '<div class="lunar-hint">点击日历可查询任意日期</div>';
    }
    html += '</div>';
    
    const allCycles = getAllCycles();
    
    if (allCycles && allCycles.length > 0) {
      const defaultColors = ['#4080FF', '#22C55E'];
      html += '<h5>我的周期</h5><ul>';
      allCycles.forEach(function(cycle) {
        const colors = cycle.colors || defaultColors;
        html +=
          '<li>' +
            '<span class="legend-dot" style="background: ' + colors[0] + '"></span>' +
            escapeHtml(cycle.name) +
            ' · 每' + cycle.periodDays + '天' +
          '</li>';
      });
      html += '</ul>';
    }
    
    legendEl.innerHTML = html;
  }
  
  // ============================================
  //  农历转换（1900-2100 标准算法表）
  // ============================================
  const LUNAR_INFO = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  const LUNAR_DAY_NAMES = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
  ];
  const LUNAR_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const LUNAR_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const LUNAR_ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  
  /**
   * 农历 y 年总天数
   */
  function lunarYearDays(y) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    }
    return sum + lunarLeapDays(y);
  }
  
  /**
   * 农历 y 年闰月大小（0=无闰月）
   */
  function lunarLeapMonth(y) {
    return LUNAR_INFO[y - 1900] & 0xf;
  }
  
  function lunarLeapDays(y) {
    return lunarLeapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0;
  }
  
  /**
   * 农历 y 年 m 月（非闰月）天数
   */
  function lunarMonthDays(y, m) {
    return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
  }
  
  /**
   * 公历转农历
   */
  function solar2lunar(y, m, d) {
    let offset = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    let i, temp = 0;
    for (i = 1900; i < 2101 && offset > 0; i++) {
      temp = lunarYearDays(i);
      offset -= temp;
    }
    if (offset < 0) {
      offset += temp;
      i--;
    }
    const leap = lunarLeapMonth(i);
    let isLeap = false;
    let lm = 0;
    for (lm = 1; lm < 13 && offset > 0; lm++) {
      if (leap > 0 && lm === leap + 1 && !isLeap) {
        --lm;
        isLeap = true;
        temp = lunarLeapDays(i);
      } else {
        temp = lunarMonthDays(i, lm);
      }
      if (isLeap && lm === leap + 1) {
        isLeap = false;
      }
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && lm === leap + 1) {
      if (isLeap) {
        isLeap = false;
      } else {
        isLeap = true;
        --lm;
      }
    }
    if (offset < 0) {
      offset += temp;
      --lm;
    }
    return { year: i, month: lm, day: offset + 1, isLeap: isLeap };
  }
  
  /**
   * 干支纪年 + 生肖，如：丙午年[马]
   */
  function ganzhiStr(lunarYear) {
    const ganIdx = ((lunarYear - 4) % 10 + 10) % 10;
    const zhiIdx = ((lunarYear - 4) % 12 + 12) % 12;
    return LUNAR_GAN[ganIdx] + LUNAR_ZHI[zhiIdx] + '年[' + LUNAR_ZODIAC[zhiIdx] + ']';
  }
  
  /**
   * 获取农历字符串，如：九月初八
   */
  function getLunarStr(y, m, d) {
    const l = solar2lunar(y, m, d);
    const monthName = (l.isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[l.month - 1] + '月';
    return monthName + LUNAR_DAY_NAMES[l.day - 1];
  }
  
  /**
   * 判断两个日期是否同一天
   */
  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  
  /**
   * 将十六进制颜色转换为 rgba 字符串
   */
  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const intVal = parseInt(c, 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }
  
  /**
   * 获取某日期的周期信息（合并所有周期）
   */
  function getDayCycleInfo(date) {
    const allCycles = getAllCycles();
    
    if (allCycles.length === 0) {
      return null;
    }
    
    // 返回第一个匹配的周期
    for (let i = 0; i < allCycles.length; i++) {
      const cycle = allCycles[i];
      const defaultColors = ['#4080FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
      const colors = cycle.colors || defaultColors;
      const cycleInfo = getCycleDayInfo(date, cycle.startDate, cycle.periodDays, colors);
      
      if (cycleInfo) {
        return {
          name: cycle.name,
          day: cycleInfo.day,
          color: cycleInfo.color,
          totalDays: cycleInfo.totalDays
        };
      }
    }
    
    return null;
  }
  
  /**
   * 渲染倒计时事件列表
   */
  function renderEvents() {
    let html = '';
    
    const allCycles = getAllCycles();
    
    // 渲染周期信息
    if (allCycles.length > 0) {
      html += '<div class="events-section">';
      html += '<h5>🔄 周期循环</h5>';
      
      allCycles.forEach(function(cycle) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const defaultColors = ['#4080FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
        const colors = cycle.colors || defaultColors;
        const cycleInfo = getCycleDayInfo(today, cycle.startDate, cycle.periodDays, colors);
        
        if (cycleInfo) {
          const remainingDays = cycle.periodDays - cycleInfo.day + 1;
          
          html += 
            '<div class="event-item cycle-info">' +
              '<div class="cycle-color-indicator" style="background: ' + cycleInfo.color + '"></div>' +
              '<div class="event-info">' +
                '<div class="event-title">' + escapeHtml(cycle.name) + '</div>' +
                '<div class="event-countdown">第 ' + cycleInfo.day + '/' + cycleInfo.totalDays + ' 天</div>' +
              '</div>' +
              '<span class="event-date">剩余 ' + remainingDays + ' 天</span>' +
            '</div>';
        }
      });
      
      html += '</div>';
    }
    
    // 渲染节日事件
    if (calendarData.events && calendarData.events.length > 0) {
      const upcomingEvents = [];
      
      calendarData.events.forEach(function(event) {
        const countdown = calculateCountdown(event.date);
        if (countdown.days >= 0) {
          upcomingEvents.push({
            event: event,
            countdown: countdown
          });
        }
      });
      
      // 按倒计时天数排序
      upcomingEvents.sort(function(a, b) {
        return a.countdown.days - b.countdown.days;
      });
      
      if (upcomingEvents.length > 0) {
        html += '<div class="events-section">';
        html += '<h5>📅 节日倒计时</h5>';
        
        upcomingEvents.forEach(function(item) {
          const event = item.event;
          const countdown = item.countdown;
          
          let countdownText = '';
          if (countdown.days === 0) {
            countdownText = '今天';
          } else if (countdown.days === 1) {
            countdownText = '明天';
          } else {
            countdownText = countdown.days + '天';
          }
          
          html += 
            '<div class="event-item">' +
              '<span class="event-icon">' + escapeHtml(event.icon) + '</span>' +
              '<div class="event-info">' +
                '<div class="event-title">' + escapeHtml(event.title) + '</div>' +
                '<div class="event-countdown">还有 ' + countdownText + '</div>' +
              '</div>' +
              '<span class="event-date">' + formatDate(event.date) + '</span>' +
            '</div>';
        });
        
        html += '</div>';
      }
    }
    
    if (!html) {
      html = '<div class="no-events">暂无事件，点击 ⚙️ 添加周期</div>';
    }
    
    eventsList.innerHTML = html;
  }
  
  /**
   * 渲染已保存的周期列表
   */
  function renderSavedCycles() {
    if (userCycles.length === 0) {
      savedCycles.innerHTML = '<p class="no-saved">暂无自定义周期</p>';
      return;
    }
    
    let html = '<h5>当前周期</h5>';
    
    userCycles.forEach(function(cycle, index) {
      html += 
        '<div class="saved-cycle-item">' +
          '<div class="saved-cycle-info">' +
            '<span class="saved-cycle-name">' + escapeHtml(cycle.name) + '</span>' +
            '<span class="saved-cycle-detail">' + formatDate(cycle.startDate) + ' 起 · 每 ' + cycle.periodDays + ' 天</span>' +
          '</div>' +
          '<div class="saved-cycle-actions">' +
            '<button class="btn-edit" data-index="' + index + '">编辑</button>' +
            '<button class="btn-delete" data-index="' + index + '">删除</button>' +
          '</div>' +
        '</div>';
    });
    
    savedCycles.innerHTML = html;
    
    // 绑定编辑按钮事件
    savedCycles.querySelectorAll('.btn-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        editCycle(index);
      });
    });
    
    // 绑定删除按钮事件
    savedCycles.querySelectorAll('.btn-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        deleteCycle(index);
      });
    });
  }
  
  /**
   * 计算倒计时
   */
  function calculateCountdown(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    
    // 设置时间为当天的开始
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    const diff = target.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    return {
      days: days
    };
  }
  
  /**
   * 格式化日期
   */
  function formatDate(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return month + '月' + day + '日';
  }
  
  /**
   * 保存周期（新增或编辑）
   */
  function handleSaveCycle() {
    const name = cycleName.value.trim();
    const start = startDate.value;
    const period = parseInt(periodDays.value);
    
    // 验证输入
    if (!name) {
      alert('请输入周期名称');
      return;
    }
    
    if (!start) {
      alert('请选择起始日期');
      return;
    }
    
    if (!period || period < 1) {
      alert('请输入有效的周期天数');
      return;
    }
    
    // 两种颜色交替
    const colors = ['#4080FF', '#22C55E'];
    
    // 编辑模式：更新已有周期
    if (editCycleIndex >= 0 && userCycles[editCycleIndex]) {
      userCycles[editCycleIndex].name = name;
      userCycles[editCycleIndex].startDate = start;
      userCycles[editCycleIndex].periodDays = period;
      userCycles[editCycleIndex].colors = colors;
    } else {
      // 新增模式：单一周期，覆盖已有周期
      const newCycle = {
        id: Date.now(),
        name: name,
        startDate: start,
        periodDays: period,
        colors: colors
      };
      userCycles = [newCycle];
    }
    
    saveUserCycles();
    
    // 清空表单和编辑状态
    resetCycleForm();
    
    // 重新渲染
    renderCalendar();
    renderEvents();
    renderSavedCycles();
    
    // 关闭设置面板
    cycleSettings.style.display = 'none';
  }
  
  /**
   * 编辑周期：填充表单进入编辑模式
   */
  function editCycle(index) {
    if (index < 0 || !userCycles[index]) return;
    
    editCycleIndex = index;
    cycleName.value = userCycles[index].name;
    startDate.value = userCycles[index].startDate;
    periodDays.value = userCycles[index].periodDays;
    
    // 显示设置面板
    cycleSettings.style.display = 'block';
    
    // 更新保存按钮文字
    saveCycle.textContent = '保存修改';
    
    // 聚焦周期名称
    cycleName.focus();
  }
  
  /**
   * 重置周期表单
   */
  function resetCycleForm() {
    cycleName.value = '';
    startDate.value = '';
    periodDays.value = '15';
    editCycleIndex = -1;
    saveCycle.textContent = '保存';
  }
  
  /**
   * 删除周期
   */
  function deleteCycle(index) {
    if (confirm('确定要删除这个周期吗？')) {
      userCycles.splice(index, 1);
      saveUserCycles();
      // 若当前正在编辑该周期则重置
      if (editCycleIndex === index) {
        resetCycleForm();
      } else if (editCycleIndex > index) {
        editCycleIndex--;
      }
      renderCalendar();
      renderEvents();
      renderSavedCycles();
    }
  }
  
  /**
   * 切换设置面板显示
   */
  function toggleSettings() {
    if (cycleSettings.style.display === 'none') {
      cycleSettings.style.display = 'block';
    } else {
      cycleSettings.style.display = 'none';
    }
  }
  
  /**
   * 加载折叠状态（默认展开）
   */
  function loadCollapseState() {
    // 默认展开，不恢复历史折叠状态
    eventsPanel.classList.remove('collapsed');
  }
  
  /**
   * 切换折叠/展开
   */
  function toggleCollapse() {
    const isCollapsed = eventsPanel.classList.toggle('collapsed');
    try {
      localStorage.setItem(COLLAPSE_KEY, isCollapsed ? 'true' : 'false');
    } catch (e) {
      // 忽略存储异常
    }
  }
  
  /**
   * 切换到上一个月
   */
  function goToPrevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    selectedDate = null;
    renderCalendar();
  }
  
  /**
   * 切换到下一个月
   */
  function goToNextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    selectedDate = null;
    renderCalendar();
  }
  
  /**
   * 回到今天（当月）
   */
  function goToToday() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDate = null;
    renderCalendar();
  }
  
  /**
   * 绑定事件
   */
  function bindEvents() {
    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);
    
    // 月份切换
    prevMonth.addEventListener('click', goToPrevMonth);
    nextMonth.addEventListener('click', goToNextMonth);
    
    // 回到今天
    calendarTodayBtn.addEventListener('click', goToToday);
    
    // 日历点击：查询选中日期的农历
    calendarDays.addEventListener('click', function(e) {
      const cell = e.target.closest('.calendar-day');
      if (!cell) return;
      const dateAttr = cell.getAttribute('data-date');
      if (!dateAttr) return;
      const parts = dateAttr.split('-');
      const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      // 再次点击同一天则取消选中，回到今天
      if (selectedDate && sameDate(selectedDate, date)) {
        selectedDate = null;
      } else {
        selectedDate = date;
      }
      renderCalendar();
    });
    
    // 图例区「回到今天」链接
    document.getElementById('cycleLegend').addEventListener('click', function(e) {
      if (e.target && e.target.id === 'lunarResetBtn') {
        selectedDate = null;
        renderCalendar();
      }
    });
    
    // 设置按钮
    settingsBtn.addEventListener('click', toggleSettings);
    
    // 折叠/展开
    collapseBtn.addEventListener('click', toggleCollapse);
    eventsHeader.addEventListener('click', function(e) {
      // 点击标题区域（非按钮）也切换折叠
      if (!e.target.closest('button')) {
        toggleCollapse();
      }
    });
    
    // 保存周期
    saveCycle.addEventListener('click', handleSaveCycle);
    
    // 取消设置
    cancelCycle.addEventListener('click', function() {
      cycleSettings.style.display = 'none';
      resetCycleForm();
    });
    
    // 搜索输入
    searchBox.addEventListener('input', function(e) {
      filterSites(e.target.value);
    });
    
    // 回到顶部
    backTop.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // 视频：点击封面播放
    videoPlayOverlay.addEventListener('click', startVideoPlayback);

    // 视频：口令校验
    if (videoLock) {
      videoLock.addEventListener('submit', function(e) {
        e.preventDefault();
        const input = (videoLockInput.value || '').trim();
        if (videoPasscodes.indexOf(input) !== -1) {
          markVideoUnlocked();
          hideVideoLock();
          startVideoPlayback();
        } else {
          videoLockTip.classList.remove('hidden');
          videoLock.classList.remove('shake');
          void videoLock.offsetWidth; // 重置动画
          videoLock.classList.add('shake');
          videoLockInput.value = '';
          videoLockInput.focus({ preventScroll: true });
        }
      });
    }
    
    // 视频：换一个
    videoRefreshBtn.addEventListener('click', function() {
      videoLoading.style.pointerEvents = 'none';
      videoLoading.style.cursor = '';
      startVideoPlayback();
    });
    
    // 视频：进入沉浸模式
    videoImmersiveBtn.addEventListener('click', enterImmersive);
    
    // 沉浸模式：换一个 / 退出
    immersiveRefreshBtn.addEventListener('click', function() {
      videoLoading.style.pointerEvents = 'none';
      videoLoading.style.cursor = '';
      startVideoPlayback();
    });
    immersiveCloseBtn.addEventListener('click', exitImmersive);
    
    // 点击黑色背景退出
    immersiveStage.addEventListener('click', function(e) {
      if (e.target === immersiveStage) {
        exitImmersive();
      }
    });
    
    // 视频：失败点击重试
    videoLoading.addEventListener('click', function() {
      if (videoLoading.style.pointerEvents === 'auto') {
        videoLoading.style.pointerEvents = 'none';
        videoLoading.style.cursor = '';
        loadVideo();
      }
    });
    
    videoPlayer.addEventListener('canplay', onVideoReady);
    videoPlayer.addEventListener('loadeddata', onVideoReady);
    videoPlayer.addEventListener('error', onVideoError);
    
    // 标签页切走暂停、切回恢复（节省资源）
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (!videoPlayer.paused && videoPlayer.src) {
          videoPlayer.pause();
          videoPausedByVisibility = true;
        }
      } else if (videoPausedByVisibility) {
        videoPausedByVisibility = false;
        videoPlayer.play().catch(function() {});
      }
    });
    
    window.addEventListener('scroll', function() {
      if (window.scrollY > 300) {
        backTop.style.display = 'flex';
      } else {
        backTop.style.display = 'none';
      }
    });
    
    // 搜索框快捷键
    document.addEventListener('keydown', function(e) {
      // Ctrl/Cmd + K 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchBox.focus();
      }
      
      // Escape：优先退出沉浸模式，其次清空搜索
      if (e.key === 'Escape') {
        if (isImmersive()) {
          exitImmersive();
          return;
        }
        if (document.activeElement === searchBox) {
          searchBox.value = '';
          filterSites('');
          searchBox.blur();
        }
      }
      
      // F 切换沉浸模式
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey &&
          document.activeElement !== searchBox && !isImmersive()) {
        const tag = document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          enterImmersive();
        }
      }
    });
  }
  
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
