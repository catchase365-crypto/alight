/*
 * Alight Plugin v2.7 - 双核优化版
 * 修复：Mac/PC 滚动回弹 (采用原生交互)、Markdown 空格语法兼容
 */

const { Plugin, Notice, Platform } = require('obsidian');

// --- 1. 批注天团 ---
const TOOLS = [
    // 第一排：高亮
    { id: 'hl-yellow', type: 'mark', val: '#D2B3FFA6', icon: '🟡', label: '紫韵' },
    { id: 'hl-green',  type: 'mark', val: '#b3ffb3a6', icon: '🟢', label: '青草' },
    { id: 'hl-blue',   type: 'mark', val: '#b3d9ffa6', icon: '🔵', label: '天蓝' },
    { id: 'hl-red',    type: 'mark', val: '#ffb3b3a6', icon: '🔴', label: '绯红' },
    { id: 'hl-orange', type: 'mark', val: '#ffdfb3a6', icon: '🟠', label: '暖阳' },

    // 第二排：格式
    { id: 'fmt-bold',   type: 'format', template: '**$1**',       icon: '𝐁',  label: '加粗' },
    { id: 'fmt-italic', type: 'format', template: '*$1*',         icon: '𝑖',  label: '斜体' },
    { id: 'fmt-under',  type: 'format', template: '<u>$1</u>',    icon: 'U̲',  label: '下划线' },
    { id: 'fmt-strike', type: 'format', template: '~~$1~~',       icon: 'S̶',  label: '删除线' },
    { id: 'fmt-red',    type: 'format', template: '<span style="color:red">$1</span>', icon: 'A', style:'color:red;font-weight:bold', label: '红字' },

    // 第三排：特殊
    { id: 'ins-slide',  type: 'format', template: '\n\n---\n\n$1', icon: '✂️', label: '分页' },
    { id: 'fmt-box',    type: 'format', template: '<span style="border:2px solid red;padding:2px">$1</span>', icon: '▢', label: '框选' },
    { id: 'ins-warn',   type: 'format', template: '❗ $1',       icon: '❗', label: '重点' },
    { id: 'ins-todo',   type: 'format', template: '- [ ] $1',    icon: '☐', label: '待办' },
    { id: 'ins-quote',  type: 'format', template: '> $1',        icon: '❝', label: '引用' },

    // 第四排：操作
    { id: 'act-clear',  type: 'action', action: 'clear',         icon: '🧹', label: '清除' },
    { id: 'act-copy',   type: 'action', action: 'copy',          icon: '❐',  label: '复制' },
    { id: 'act-undo',   type: 'action', action: 'undo',          icon: '↩️', label: '撤销' },
];

module.exports = class AlightPlugin extends Plugin {
    async onload() {
        const platformName = Platform.isMobile ? "移动端" : "桌面端";
        new Notice(`Alight v2.7 已加载 (${platformName}模式)`);
        
        this.isActive = false; 
        this.currentTool = TOOLS[0]; 

        this.addStyle();
        this.app.workspace.onLayoutReady(() => this.createUI());
        
        // 【桌面端专属】注册全局鼠标松开事件
        // 桌面端不使用 Overlay，直接监听鼠标选区释放，实现原生滚动+自动高亮
        if (!Platform.isMobile) {
            this.registerDomEvent(document, 'mouseup', (evt) => {
                if (this.isActive) {
                    // 稍微延迟，等待选区稳定
                    setTimeout(() => this.handleDesktopPaint(), 20);
                }
            });
        }
    }

    onunload() {
        if (this.uiContainer) this.uiContainer.remove();
        if (this.overlay) this.overlay.remove();
        if (this.styleEl) this.styleEl.remove();
        if (this.scrollIndicator) this.scrollIndicator.remove();
    }

    addStyle() {
        this.styleEl = document.createElement('style');
        this.styleEl.innerHTML = `
            /* 魔法遮罩：仅在移动端生效，桌面端强制隐藏 */
            .alight-magic-overlay {
                position: fixed;
                top: 0; left: 0; bottom: 0; right: 0;
                z-index: 999990;
                background: transparent;
                touch-action: none; 
                display: none; 
                cursor: crosshair;
            }
            .alight-magic-overlay.active { display: block; }

            /* UI 容器 */
            .alight-ui-container {
                position: fixed;
                bottom: 80px; left: 20px;
                z-index: 999999;
                display: flex;
                flex-direction: column-reverse;
                align-items: flex-start;
                gap: 10px;
                pointer-events: none; 
            }

            .alight-main-btn {
                pointer-events: auto;
                width: 50px; height: 50px;
                border-radius: 50%;
                background: #333;
                border: 2px solid #666;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                color: #ddd;
                font-size: 24px;
                display: flex; justify-content: center; align-items: center;
                transition: all 0.2s;
                cursor: pointer;
            }
            .alight-main-btn.active {
                background: #eee; color: #111; border-color: #fff;
                transform: rotate(45deg);
            }

            .alight-toolbox {
                pointer-events: auto;
                background: rgba(30, 30, 30, 0.95);
                border: 1px solid #555;
                border-radius: 16px;
                padding: 8px;
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
                opacity: 0;
                transform: translateY(20px) scale(0.9);
                pointer-events: none;
                transition: all 0.2s;
            }
            .alight-ui-container.open .alight-toolbox {
                opacity: 1; transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            .alight-tool-btn {
                width: 38px; height: 38px;
                border-radius: 8px;
                background: #444;
                display: flex; justify-content: center; align-items: center;
                font-size: 16px; color: #eee;
                border: 1px solid transparent;
                cursor: pointer;
            }
            .alight-tool-btn.selected {
                background: #222; border-color: #fff;
                box-shadow: 0 0 6px rgba(255,255,255,0.4);
            }
            .alight-tool-btn[data-type="mark"] { color: transparent; }

            .alight-scroll-indicator {
                position: fixed;
                background: rgba(255, 255, 255, 0.2);
                border-left: 2px solid rgba(255,255,255,0.8);
                z-index: 999991;
                pointer-events: none;
                display: none;
            }
        `;
        document.head.appendChild(this.styleEl);
    }

    createUI() {
        if (document.querySelector('.alight-ui-container')) return;

        // 仅在移动端创建 Overlay，桌面端不需要
        if (Platform.isMobile) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'alight-magic-overlay';
            document.body.appendChild(this.overlay);
            this.bindMobileEvents(); // 仅绑定移动端触摸事件
            
            this.scrollIndicator = document.createElement('div');
            this.scrollIndicator.className = 'alight-scroll-indicator';
            document.body.appendChild(this.scrollIndicator);
        }

        this.uiContainer = document.createElement('div');
        this.uiContainer.className = 'alight-ui-container';

        this.toolbox = document.createElement('div');
        this.toolbox.className = 'alight-toolbox';
        
        TOOLS.forEach(tool => {
            const btn = document.createElement('div');
            btn.className = 'alight-tool-btn';
            btn.innerHTML = tool.icon;
            btn.setAttribute('data-type', tool.type);
            if (tool.type === 'mark') btn.style.backgroundColor = tool.val;
            if (tool.style) btn.setAttribute('style', tool.style);
            if (tool.id === this.currentTool.id) btn.classList.add('selected');

            btn.onclick = (e) => {
                e.stopPropagation();
                if (tool.id === 'act-undo') {
                    this.app.commands.executeCommandById('editor:undo');
                    new Notice("已撤销");
                    return;
                }
                this.switchTool(tool, btn);
            };
            this.toolbox.appendChild(btn);
        });

        this.mainBtn = document.createElement('div');
        this.mainBtn.className = 'alight-main-btn';
        this.mainBtn.innerText = '+';
        this.mainBtn.onclick = (e) => {
            e.stopPropagation();
            this.togglePlugin();
        };

        this.uiContainer.appendChild(this.mainBtn);
        this.uiContainer.appendChild(this.toolbox);
        document.body.appendChild(this.uiContainer);
    }

    togglePlugin() {
        this.isActive = !this.isActive;
        const method = this.isActive ? 'add' : 'remove';
        
        this.uiContainer.classList[method]('open');
        this.mainBtn.classList[method]('active');
        
        // 只有移动端才操作 Overlay
        if (this.overlay) {
            this.overlay.classList[method]('active');
            this.overlay.style.display = ''; // 确保 class 生效
        }

        if(this.isActive) new Notice("Alight v2.7 已开启");
    }

    switchTool(tool, btn) {
        this.currentTool = tool;
        const all = this.toolbox.querySelectorAll('.alight-tool-btn');
        all.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if(navigator.vibrate) navigator.vibrate(10);
    }

    // === 核心逻辑1：桌面端处理 (Desktop) ===
    handleDesktopPaint() {
        const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!view || !view.editor) return;
        
        const editor = view.editor;
        if (!editor.somethingSelected()) return;

        // 获取选区范围
        const cursorFrom = editor.getCursor('from');
        const cursorTo = editor.getCursor('to');
        
        // 执行工具
        this.executeToolLogic(editor, cursorFrom, cursorTo);
    }

    // === 核心逻辑2：移动端处理 (Mobile) ===
    bindMobileEvents() {
        let mode = 'none'; 
        let startX, startY;
        let targetScrollEl = null;
        let startScrollTop = 0;
        const SCROLL_ZONE_WIDTH = 70; 

        const findScroller = (x, y) => {
            this.overlay.style.display = 'none';
            const el = document.elementFromPoint(x, y);
            this.overlay.style.display = ''; 
            if(!el) return null;
            return el.closest('.cm-scroller') || el.closest('.markdown-preview-view');
        };

        // 移动端不监听 wheel，因为没有物理滚轮，且会导致冲突
        // 触摸逻辑
        const handleStart = (x, y) => {
            startX = x;
            startY = y;
            targetScrollEl = findScroller(x, y);

            if (targetScrollEl) {
                const rect = targetScrollEl.getBoundingClientRect();
                if (rect.right - x <= SCROLL_ZONE_WIDTH) {
                    mode = 'scroll';
                    startScrollTop = targetScrollEl.scrollTop;
                    this.showScrollIndicator(rect.top, rect.right - 8, rect.height);
                } else {
                    mode = 'paint';
                }
            } else {
                mode = 'none';
            }
        };

        const handleMove = (x, y, e) => {
            if (mode === 'scroll' && targetScrollEl) {
                const dy = y - startY;
                targetScrollEl.scrollTop = startScrollTop - dy;
            }
            if(e && e.cancelable) e.preventDefault(); 
        };

        const handleEnd = (x, y) => {
            if (mode === 'paint') {
                if (Math.abs(x - startX) > 5 || Math.abs(y - startY) > 5) {
                    this.applyToolMobile(startX, startY, x, y);
                }
            } else if (mode === 'scroll' && targetScrollEl) {
                this.landCursorSafely(targetScrollEl);
            }
            mode = 'none';
            targetScrollEl = null;
            this.scrollIndicator.style.display = 'none';
        };

        this.overlay.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY), {passive:false});
        this.overlay.addEventListener('touchmove', (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY, e), {passive:false});
        this.overlay.addEventListener('touchend', (e) => handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY), {passive:false});
    }

    showScrollIndicator(top, left, height) {
        const ind = this.scrollIndicator;
        ind.style.top = top + 'px';
        ind.style.left = left + 'px';
        ind.style.height = height + 'px';
        ind.style.width = '6px';
        ind.style.display = 'block';
    }

    landCursorSafely(scrollerEl) {
        const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!view || !view.editor) return;
        const rect = scrollerEl.getBoundingClientRect();
        const midY = rect.top + (rect.height / 2);
        const pos = view.editor.posAtCoords({x: rect.left + 50, y: midY});
        if (pos) view.editor.setCursor({line: pos.line, ch: 0});
    }

    applyToolMobile(x1, y1, x2, y2) {
        this.overlay.style.display = 'none';
        let rangeFound = false;
        let startContainer, startOffset, endContainer, endOffset;

        try {
            const rangeStart = document.caretRangeFromPoint(x1, y1);
            const rangeEnd = document.caretRangeFromPoint(x2, y2);
            if (rangeStart && rangeEnd) {
                rangeFound = true;
                startContainer = rangeStart.startContainer;
                startOffset = rangeStart.startOffset;
                endContainer = rangeEnd.startContainer;
                endOffset = rangeEnd.startOffset;
            }
        } catch (e) {
            console.error(e);
        } finally {
            this.overlay.style.display = ''; 
        }

        if (rangeFound) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStart(startContainer, startOffset);
            newRange.setEnd(endContainer, endOffset);
            if (newRange.collapsed) {
                newRange.setStart(endContainer, endOffset);
                newRange.setEnd(startContainer, startOffset);
            }
            selection.addRange(newRange);

            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
                if (view && view.editor) {
                    this.executeToolLogic(view.editor);
                }
            }, 10);
        }
    }

    // === 通用逻辑：执行替换与光标跳转 ===
    executeToolLogic(editor) {
        const selText = editor.getSelection();
        if (!selText || selText.length === 0) return;

        // === 核心：智能空格剥离 ===
        // 正则解释：
        // ^(\s*) -> 捕获开头的空格 Group 1
        // ([\s\S]*?) -> 捕获中间的内容(非贪婪) Group 2
        // (\s*)$ -> 捕获结尾的空格 Group 3
        const match = selText.match(/^(\s*)([\s\S]*?)(\s*)$/);
        const prefix = match[1] || '';
        const body = match[2] || '';
        const suffix = match[3] || '';

        const tool = this.currentTool;
        let replacementBody = body;

        // 如果中间没有内容，只选了空格，就不做处理
        if (body.length === 0) return;

        if (tool.id === 'act-copy') {
            navigator.clipboard.writeText(selText);
            new Notice("已复制");
            return; 
        }
        
        if (tool.id === 'act-clear') {
            replacementBody = body.replace(/<[^>]*>|[*~=]/g, '');
        } else if (tool.type === 'mark') {
            replacementBody = `<mark style="background: ${tool.val};">${body}</mark>`;
        } else if (tool.type === 'format') {
            replacementBody = tool.template.replace('$1', body);
        }

        // 重新拼装：前缀空格 + 格式化内容 + 后缀空格
        const finalReplacement = prefix + replacementBody + suffix;
        
        editor.replaceSelection(finalReplacement);

        // === 光标逻辑: +2格 或 自动换行 ===
        const cursor = editor.getCursor();
        const lineContent = editor.getLine(cursor.line);
        const lineLen = lineContent.length;
        
        let targetCh = cursor.ch + 2;
        let targetLine = cursor.line;

        if (targetCh > lineLen) {
            if (targetLine < editor.lineCount() - 1) {
                targetLine += 1; 
                targetCh = 0;    
            } else {
                targetCh = lineLen; 
            }
        }

        editor.setCursor({ line: targetLine, ch: targetCh });
        
        // 清理系统选区
        if (window.getSelection) window.getSelection().removeAllRanges();
    }
};