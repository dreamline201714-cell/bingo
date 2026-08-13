/**
 * Office Bingo Live Client Application Logic
 */

(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let isHost = false;
    let soundEnabled = true;
    let currentTheme = 'light';

    let roomState = null;
    let selectedSize = 5;
    let selectedGameMode = 'WINNER';
    let spectatingPlayerId = null;
    let configModalSelectedSize = 5;

    function initStealthMode() {
        const btnStealthToggle = document.getElementById('btn-stealth-toggle');
        const stealthOpacityBox = document.getElementById('stealth-opacity-box');
        const stealthOpacityRange = document.getElementById('stealth-opacity-range');
        const brandTitleEl = document.getElementById('brand-title-el');
        const brandIconEl = document.getElementById('brand-icon-el');

        if (btnStealthToggle) {
            btnStealthToggle.onclick = function (e) {
                e.preventDefault();
                document.body.classList.toggle('excel-stealth-mode');
                const isStealth = document.body.classList.contains('excel-stealth-mode');

                if (stealthOpacityBox) {
                    stealthOpacityBox.style.display = isStealth ? 'flex' : 'none';
                }

                if (isStealth) {
                    if (brandIconEl) brandIconEl.innerText = '📊';
                    if (brandTitleEl) brandTitleEl.innerHTML = '26년 재무상태표.xlsx <small style="font-size:0.65rem; color:#fff; vertical-align:super;">- Excel</small>';
                } else {
                    document.body.style.opacity = '1';
                    if (stealthOpacityRange) stealthOpacityRange.value = '100';
                    if (brandIconEl) brandIconEl.innerText = '🎯';
                    if (brandTitleEl) brandTitleEl.innerHTML = 'Office Bingo <small style="font-size:0.65rem; color:var(--accent); vertical-align:super;">LIVE</small>';
                }
            };
        }

        if (stealthOpacityRange) {
            stealthOpacityRange.oninput = function (e) {
                document.body.style.opacity = (e.target.value / 100).toString();
            };
        }
    }

    // ★ 모바일 바텀시트 슬라이딩 제어 스크립트 ★
    function initMobileSidebar() {
        const mobileFabBtn = document.getElementById('mobile-fab-btn');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

        if (mobileFabBtn && mobileSidebar) {
            mobileFabBtn.onclick = () => {
                mobileSidebar.classList.add('active');
            };
        }
        if (mobileSidebarClose && mobileSidebar) {
            mobileSidebarClose.onclick = () => {
                mobileSidebar.classList.remove('active');
            };
        }
    }

    function initNavControls() {
        const btnHelp = document.getElementById('btn-help');
        const helpModal = document.getElementById('help-modal');
        const helpModalClose = document.getElementById('help-modal-close');
        const soundToggleBtn = document.getElementById('sound-toggle-btn');
        const themeToggleBtn = document.getElementById('theme-toggle-btn');

        if (btnHelp && helpModal) {
            btnHelp.onclick = () => helpModal.classList.add('active');
        }
        if (helpModalClose && helpModal) {
            helpModalClose.onclick = () => helpModal.classList.remove('active');
        }

        if (soundToggleBtn) {
            soundToggleBtn.onclick = () => {
                soundEnabled = !soundEnabled;
                soundToggleBtn.innerText = soundEnabled ? '🔊' : '🔇';
                showToast(soundEnabled ? '사운드가 켜졌습니다.' : '사운드가 꺼졌습니다.');
            };
        }

        if (themeToggleBtn) {
            themeToggleBtn.onclick = () => {
                currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);
                document.body.setAttribute('data-theme', currentTheme);
                themeToggleBtn.innerText = (currentTheme === 'dark') ? '☀️' : '🌙';
            };
        }
    }

    function initPresetChips() {
        const createGroup = document.getElementById('preset-chip-group');
        const configGroup = document.getElementById('config-preset-chip-group');

        const presets = (typeof BINGO_PRESETS !== 'undefined' && Array.isArray(BINGO_PRESETS))
            ? BINGO_PRESETS
            : [{ id: "custom", title: "자유 주제", words: [] }];

        if (createGroup) {
            createGroup.innerHTML = '';
            presets.forEach((preset, index) => {
                const chip = document.createElement('div');
                chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
                chip.innerText = preset.title;

                chip.addEventListener('click', () => {
                    createGroup.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    if (preset.id === 'custom') {
                        if (createTopicInput) createTopicInput.value = '자유 주제';
                        if (createWordsInput) createWordsInput.value = '';
                    } else {
                        if (createTopicInput) createTopicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                        if (createWordsInput) createWordsInput.value = (preset.words || []).join('\n');
                    }
                });
                createGroup.appendChild(chip);
            });
        }

        if (configGroup) {
            configGroup.innerHTML = '';
            presets.forEach((preset, index) => {
                const chip = document.createElement('div');
                chip.className = 'preset-chip' + (index === 0 ? ' active' : '');
                chip.innerText = preset.title;

                chip.addEventListener('click', () => {
                    configGroup.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    if (preset.id === 'custom') {
                        if (configTopicInput) configTopicInput.value = '자유 주제';
                        if (configWordsInput) configWordsInput.value = '';
                    } else {
                        if (configTopicInput) configTopicInput.value = preset.title.replace(/^[^\s]+\s+/, '');
                        if (configWordsInput) configWordsInput.value = (preset.words || []).join('\n');
                    }
                });
                configGroup.appendChild(chip);
            });
        }
    }

    function updateTargetLinesOptions(size, selectEl) {
        if (!selectEl) return;
        const maxLines = (size * 2) + 2;
        selectEl.innerHTML = '';
        for (let i = 1; i <= maxLines; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = (i === maxLines) ? `${i} 줄 완성 (올빙고 완승)` : `${i} 줄 완성 승리`;
            if (i === size) opt.selected = true;
            selectEl.appendChild(opt);
        }
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
    }

    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    const lobbySection = document.getElementById('lobby-section');
    const arenaSection = document.getElementById('arena-section');

    const tabBtnCreate = document.getElementById('tab-btn-create');
    const tabBtnJoin = document.getElementById('tab-btn-join');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');

    const createNicknameInput = document.getElementById('create-nickname');
    const createTopicInput = document.getElementById('create-topic');
    const createWordsInput = document.getElementById('create-words');
    const createTargetLinesSelect = document.getElementById('create-target-lines');

    const configTopicInput = document.getElementById('config-topic-input');
    const configWordsInput = document.getElementById('config-words-input');
    const configTargetLinesSelect = document.getElementById('config-target-lines');

    const joinNicknameInput = document.getElementById('join-nickname');
    const joinRoomCodeInput = document.getElementById('join-room-code');

    const displayTopicTitle = document.getElementById('display-topic-title');
    const displayGridInfo = document.getElementById('display-grid-info');
    const displayRoomCode = document.getElementById('display-room-code');
    const roomStateBadge = document.getElementById('room-state-badge');
    const btnCopyLink = document.getElementById('btn-copy-link');
    const btnShowQr = document.getElementById('btn-show-qr');

    const turnBanner = document.getElementById('turn-banner');

    const hostControls = document.getElementById('host-controls');
    const btnHostStart = document.getElementById('btn-host-start');
    const btnHostReset = document.getElementById('btn-host-reset');
    const btnHostConfig = document.getElementById('btn-host-config');

    const configModal = document.getElementById('config-modal');
    const configModalClose = document.getElementById('config-modal-close');
    const btnConfigSave = document.getElementById('btn-config-save');
    const btnConfigCancel = document.getElementById('btn-config-cancel');

    const spectateModal = document.getElementById('spectate-modal');
    const spectateModalClose = document.getElementById('spectate-modal-close');
    const spectateModalTitle = document.getElementById('spectate-modal-title');
    const spectateModalScore = document.getElementById('spectate-modal-score');
    const spectateGrid = document.getElementById('spectate-grid');

    const resetOptionModal = document.getElementById('reset-option-modal');
    const btnResetKeep = document.getElementById('btn-reset-keep');
    const btnResetShuffle = document.getElementById('btn-reset-shuffle');
    const btnResetCancel = document.getElementById('btn-reset-cancel');

    const qrModal = document.getElementById('qr-modal');
    const qrModalClose = document.getElementById('qr-modal-close');
    const qrCodeContainer = document.getElementById('qrcode');

    const bingoBoardGrid = document.getElementById('bingo-board-grid');
    const footerWaitingControls = document.getElementById('footer-waiting-controls');
    const footerPlayingControls = document.getElementById('footer-playing-controls');

    const btnToggleReady = document.getElementById('btn-toggle-ready');
    const btnAutoFill = document.getElementById('btn-auto-fill');
    const btnClearBoard = document.getElementById('btn-clear-board');

    const topicWordsChips = document.getElementById('topic-words-chips');
    const panelPlayers = document.getElementById('panel-players');
    const playerCountSpan = document.getElementById('player-count');
    const mobilePlayerCount = document.getElementById('mobile-player-count');
    const chatMessagesBox = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    const stabChat = document.getElementById('stab-chat');
    const stabCalls = document.getElementById('stab-calls');
    const panelChat = document.getElementById('panel-chat');
    const panelCalls = document.getElementById('panel-calls');

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            if (tabBtnJoin) tabBtnJoin.click();
            if (joinRoomCodeInput) joinRoomCodeInput.value = roomParam.toUpperCase();
        }
    }

    function connectNetwork() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        socket.onopen = () => {
            if (statusText) statusText.innerText = '서버 연결됨';
            if (statusDot) statusDot.className = 'status-dot connected';
            checkUrlQueryParams();
        };

        socket.onmessage = (event) => {
            try { handleServerMessage(JSON.parse(event.data)); } catch (e) {}
        };

        socket.onclose = () => {
            if (statusText) statusText.innerText = '서버 연결 끊김';
            if (statusDot) statusDot.className = 'status-dot';
            setTimeout(connectNetwork, 2000);
        };
    }

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        }
    }

    function handleServerMessage(msg) {
        switch (msg.type) {
            case 'ROOM_JOINED':
                currentRoomId = msg.room_id;
                myPlayerId = msg.player_id;
                isHost = msg.is_host;
                roomState = msg.state;
                if (lobbySection) lobbySection.style.display = 'none';
                if (arenaSection) arenaSection.style.display = 'block';
                updateArenaUI();
                break;
            case 'ROOM_UPDATED':
                roomState = msg.state;
                updateArenaUI();
                if (spectatingPlayerId) renderSpectateBoard(spectatingPlayerId);
                break;
            case 'CHAT_MESSAGE':
                if (roomState && msg.chat) {
                    roomState.chat_logs.push(msg.chat);
                    renderChatLogs();
                }
                break;
            case 'ERROR':
                showToast(msg.message || '오류가 발생했습니다.');
                break;
        }
    }

    function updateArenaUI() {
        if (!roomState) return;
        const config = roomState.config;
        const status = roomState.status;
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);

        if (displayTopicTitle) displayTopicTitle.innerText = config.topic;
        if (displayGridInfo) displayGridInfo.innerText = `${config.size}x${config.size} 빙고 | 완성 목표: ${config.target_lines || config.size}줄`;
        if (displayRoomCode) displayRoomCode.innerText = roomState.room_id;

        if (status === 'WAITING') {
            if (roomStateBadge) { roomStateBadge.className = 'room-state-badge waiting'; roomStateBadge.innerText = '대기 중'; }
            if (footerWaitingControls) footerWaitingControls.style.display = 'flex';
            if (footerPlayingControls) footerPlayingControls.style.display = 'none';
            if (turnBanner) turnBanner.style.display = 'none';
        } else {
            if (roomStateBadge) { roomStateBadge.className = 'room-state-badge playing'; roomStateBadge.innerText = '진행 중'; }
            if (footerWaitingControls) footerWaitingControls.style.display = 'none';
            if (footerPlayingControls) footerPlayingControls.style.display = 'flex';
            if (turnBanner) turnBanner.style.display = 'flex';
        }

        if (myPlayer && myPlayer.is_host) {
            if (hostControls) hostControls.style.display = status === 'WAITING' ? 'block' : 'none';
            if (btnHostStart) {
                const allReady = roomState.players.every(p => p.is_ready);
                btnHostStart.disabled = !allReady;
                btnHostStart.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
            }
        } else {
            if (hostControls) hostControls.style.display = 'none';
        }

        if (myPlayer) {
            renderBingoBoard(myPlayer.board, myPlayer.marked, config.size, status, myPlayer.is_ready);
            renderTopicWordChips(myPlayer.board);
        }
        renderPlayersRoster(status);
        renderChatLogs();
    }

    function renderBingoBoard(board, markedIndices, size, status, isReady) {
        if (!bingoBoardGrid) return;
        bingoBoardGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        bingoBoardGrid.innerHTML = '';
        const markedSet = new Set(markedIndices);

        board.forEach((text, index) => {
            const cell = document.createElement('div');
            const hasText = text && text.trim().length > 0;
            const isMarked = markedSet.has(index);

            cell.className = 'bingo-cell' + (isMarked ? ' marked' : '');
            cell.innerText = hasText ? text : `(${index + 1}번)`;

            cell.addEventListener('click', () => {
                if (roomState.status === 'PLAYING' && myPlayerId === roomState.current_turn_player_id && !isMarked && hasText) {
                    sendMessage({ type: 'MARK_CELL', room_id: currentRoomId, cell_index: index, player_id: myPlayerId });
                }
            });
            bingoBoardGrid.appendChild(cell);
        });
    }

    function openSpectateModal(playerId) {
        spectatingPlayerId = playerId;
        renderSpectateBoard(playerId);
        if (spectateModal) spectateModal.classList.add('active');
    }

    function renderSpectateBoard(playerId) {
        const player = roomState.players.find(p => p.player_id === playerId);
        if (!player) return;

        if (spectateModalTitle) spectateModalTitle.innerText = `${player.nickname}님의 실시간 관전 상태`;
        if (spectateModalScore) spectateModalScore.innerText = `현재 ${player.score}줄 완성 (목표: ${roomState.config.target_lines || roomState.config.size}줄)`;

        const size = roomState.config.size;
        if (spectateGrid) {
            spectateGrid.style.display = 'grid';
            spectateGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
            spectateGrid.style.gap = '4px';
            spectateGrid.style.width = '100%';
            spectateGrid.style.aspectRatio = '1/1';
            spectateGrid.style.margin = '10px 0';
            spectateGrid.innerHTML = '';

            const markedSet = new Set(player.marked);

            for (let idx = 0; idx < size * size; idx++) {
                const cell = document.createElement('div');
                const isMarked = markedSet.has(idx);

                cell.className = 'bingo-cell' + (isMarked ? ' marked' : '');
                cell.innerText = isMarked ? '✓' : `(${idx + 1})`;
                cell.style.cursor = 'default';
                cell.style.fontSize = '1.2rem';
                spectateGrid.appendChild(cell);
            }
        }
    }

    function renderTopicWordChips(myBoard) {
        if (!topicWordsChips) return;
        topicWordsChips.innerHTML = '';
        const wordPool = roomState.config.word_pool || [];
        const usedSet = new Set(myBoard.map(w => w.trim()));

        wordPool.forEach(word => {
            const chip = document.createElement('div');
            const isUsed = usedSet.has(word.trim());
            chip.className = 'topic-word-chip' + (isUsed ? ' used' : '');
            chip.innerText = word;
            topicWordsChips.appendChild(chip);
        });
    }

    function renderPlayersRoster(status) {
        if (!panelPlayers) return;
        panelPlayers.innerHTML = '';
        const playersList = roomState ? roomState.players : [];
        if (playerCountSpan) playerCountSpan.innerText = playersList.length;
        if (mobilePlayerCount) mobilePlayerCount.innerText = playersList.length;

        playersList.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${p.color};">${p.nickname.charAt(0)}</div>
                    <div class="player-name">${escapeHtml(p.nickname)} ${p.is_host ? '<span class="host-tag">방장</span>' : ''}</div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    ${p.is_ready ? '<span class="ready-tag ready">준비 완료</span>' : '<span class="ready-tag waiting">작성 중...</span>'}
                    <button class="spectate-btn" data-pid="${p.player_id}">관전</button>
                </div>
            `;

            const specBtn = card.querySelector('.spectate-btn');
            if (specBtn) {
                specBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openSpectateModal(p.player_id);
                });
            }

            panelPlayers.appendChild(card);
        });
    }

    function renderChatLogs() {
        if (!chatMessagesBox) return;
        chatMessagesBox.innerHTML = '';
        if (!roomState || !roomState.chat_logs) return;
        roomState.chat_logs.forEach(chat => {
            if (chat.system) return;
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.innerHTML = `<span class="sender" style="color:${chat.color}">${escapeHtml(chat.nickname)}:</span> <span>${escapeHtml(chat.text)}</span>`;
            chatMessagesBox.appendChild(msgEl);
        });
        chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
    }

    function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

    if (stabChat && stabCalls) {
        stabChat.onclick = () => {
            stabChat.classList.add('active');
            stabCalls.classList.remove('active');
            if (panelChat) panelChat.style.display = 'flex';
            if (panelCalls) panelCalls.style.display = 'none';
        };

        stabCalls.onclick = () => {
            stabCalls.classList.add('active');
            stabChat.classList.remove('active');
            if (panelCalls) panelCalls.style.display = 'flex';
            if (panelChat) panelChat.style.display = 'none';
        };
    }

    if (btnShowQr) {
        btnShowQr.onclick = () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            if (qrCodeContainer) {
                qrCodeContainer.innerHTML = '';
                if (typeof QRCode === 'function') {
                    new QRCode(qrCodeContainer, { text: shareUrl, width: 180, height: 180 });
                } else {
                    qrCodeContainer.innerText = shareUrl;
                }
            }
            if (qrModal) qrModal.classList.add('active');
        };
    }
    if (qrModalClose) qrModalClose.onclick = () => { if (qrModal) qrModal.classList.remove('active'); };

    if (btnHostReset) btnHostReset.addEventListener('click', () => { if (resetOptionModal) resetOptionModal.classList.add('active'); });
    if (btnResetKeep) btnResetKeep.addEventListener('click', () => { sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: true }); if (resetOptionModal) resetOptionModal.classList.remove('active'); });
    if (btnResetShuffle) btnResetShuffle.addEventListener('click', () => { sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId, keep_board: false }); if (resetOptionModal) resetOptionModal.classList.remove('active'); });
    if (btnResetCancel) btnResetCancel.addEventListener('click', () => { if (resetOptionModal) resetOptionModal.classList.remove('active'); });

    if (btnHostConfig) {
        btnHostConfig.addEventListener('click', () => {
            if (!roomState || !roomState.config) return;
            if (configTopicInput) configTopicInput.value = roomState.config.topic || '자유 주제';
            if (configWordsInput) configWordsInput.value = (roomState.config.word_pool || []).join('\n');
            updateTargetLinesOptions(roomState.config.size || 5, configTargetLinesSelect);
            if (configTargetLinesSelect) configTargetLinesSelect.value = roomState.config.target_lines || roomState.config.size || 5;
            if (configModal) configModal.classList.add('active');
        });
    }

    if (btnConfigSave) {
        btnConfigSave.addEventListener('click', () => {
            const newTopic = configTopicInput ? configTopicInput.value.trim() : '자유 주제';
            const newWords = configWordsInput ? (configWordsInput.value || '').split('\n').map(w => w.trim()).filter(w => w) : [];
            const newTargetLines = configTargetLinesSelect ? parseInt(configTargetLinesSelect.value) : configModalSelectedSize;

            sendMessage({
                type: 'UPDATE_CONFIG', room_id: currentRoomId, topic: newTopic, size: configModalSelectedSize || 5, target_lines: newTargetLines, word_pool: newWords, player_id: myPlayerId
            });
            if (configModal) configModal.classList.remove('active');
        });
    }

    if (btnConfigCancel) btnConfigCancel.addEventListener('click', () => { if (configModal) configModal.classList.remove('active'); });
    if (configModalClose) configModalClose.addEventListener('click', () => { if (configModal) configModal.classList.remove('active'); });
    if (spectateModalClose) spectateModalClose.addEventListener('click', () => { if (spectateModal) spectateModal.classList.remove('active'); spectatingPlayerId = null; });

    document.addEventListener('click', (e) => {
        const sizeBtn = e.target.closest('.size-btn');
        if (sizeBtn) {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            sizeBtn.classList.add('selected');
            selectedSize = parseInt(sizeBtn.getAttribute('data-size')) || 5;
            updateTargetLinesOptions(selectedSize, createTargetLinesSelect);
            return;
        }

        const configSizeBtn = e.target.closest('.config-size-btn');
        if (configSizeBtn) {
            document.querySelectorAll('.config-size-btn').forEach(b => b.classList.remove('selected'));
            configSizeBtn.classList.add('selected');
            configModalSelectedSize = parseInt(configSizeBtn.getAttribute('data-size')) || 5;
            updateTargetLinesOptions(configModalSelectedSize, configTargetLinesSelect);
            return;
        }

        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
            if (tabBtn.id === 'tab-btn-create') {
                if (tabBtnCreate) tabBtnCreate.classList.add('active'); 
                if (tabBtnJoin) tabBtnJoin.classList.remove('active');
                if (createRoomForm) createRoomForm.style.display = 'block'; 
                if (joinRoomForm) joinRoomForm.style.display = 'none';
            } else if (tabBtn.id === 'tab-btn-join') {
                if (tabBtnJoin) tabBtnJoin.classList.add('active'); 
                if (tabBtnCreate) tabBtnCreate.classList.remove('active');
                if (joinRoomForm) joinRoomForm.style.display = 'block'; 
                if (createRoomForm) createRoomForm.style.display = 'none';
            }
            return;
        }
    });

    if (createRoomForm) {
        createRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage({
                type: 'CREATE_ROOM', game_type: 'BINGO',
                nickname: createNicknameInput.value.trim() || '김사원',
                size: selectedSize,
                target_lines: createTargetLinesSelect ? parseInt(createTargetLinesSelect.value) : selectedSize,
                topic: createTopicInput.value.trim() || '자유 주제',
                game_mode: selectedGameMode, word_pool: (createWordsInput.value || '').split('\n').map(w => w.trim()).filter(w => w)
            });
        });
    }

    if (joinRoomForm) {
        joinRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage({ type: 'JOIN_ROOM', nickname: joinNicknameInput.value.trim() || '이대리', room_id: joinRoomCodeInput.value.trim().toUpperCase() });
        });
    }

    if (btnToggleReady) btnToggleReady.addEventListener('click', () => { sendMessage({ type: 'TOGGLE_READY' }); });
    if (btnAutoFill) btnAutoFill.addEventListener('click', () => {
        const size = selectedSize; const total = size * size;
        let words = roomState?.config?.word_pool || [];
        if (words.length < total) for (let i = 1; i <= total - words.length; i++) words.push(`단어 ${i}`);
        sendMessage({ type: 'UPDATE_BOARD', board: [...words].sort(() => 0.5 - Math.random()).slice(0, total) });
    });
    if (btnClearBoard) btnClearBoard.addEventListener('click', () => { sendMessage({ type: 'UPDATE_BOARD', board: Array(selectedSize * selectedSize).fill('') }); });

    if (btnCopyLink) {
        btnCopyLink.addEventListener('click', () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!'));
            else prompt('링크를 복사하세요:', shareUrl);
        });
    }

    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (chatInput.value.trim()) {
                sendMessage({ type: 'CHAT_MESSAGE', message: chatInput.value.trim() });
                chatInput.value = '';
            }
        });
    }

    // 초기화 실행
    initStealthMode();
    initMobileSidebar(); // ★ 모바일 바텀시트 슬라이더 초기화 ★
    initNavControls();
    initPresetChips();
    updateTargetLinesOptions(selectedSize, createTargetLinesSelect);
    connectNetwork();
})();