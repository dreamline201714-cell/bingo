(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let roomState = null;

    let selectedTiles = [];
    let localRack = [];
    let localTableSets = [];
    let selectedTimeLimit = 60;
    let timerInterval = null;
    let timerSecondsLeft = 60;
    let soundEnabled = true;
    let currentTheme = 'light';

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
                    if (brandIconEl) brandIconEl.innerText = '🧩';
                    if (brandTitleEl) brandTitleEl.innerHTML = 'Office Rummikub <small style="font-size:0.65rem; color:var(--accent); vertical-align:super;">LIVE</small>';
                }
            };
        }

        if (stealthOpacityRange) {
            stealthOpacityRange.oninput = function (e) {
                document.body.style.opacity = (e.target.value / 100).toString();
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

    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
    }

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            const joinTabBtn = document.getElementById('tab-btn-join');
            if (joinTabBtn) joinTabBtn.click();
            const joinCodeInput = document.getElementById('join-room-code');
            if (joinCodeInput) joinCodeInput.value = roomParam.toUpperCase();
        }
    }

    function connectNetwork() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        socket.onopen = () => { 
            const statusEl = document.getElementById('status-text');
            if(statusEl) statusEl.innerText = '연결됨'; 
            checkUrlQueryParams();
        };
        socket.onmessage = (e) => {
            try { handleServerMessage(JSON.parse(e.data)); } catch (err) {}
        };
        socket.onclose = () => {
            const statusEl = document.getElementById('status-text');
            if(statusEl) statusEl.innerText = '연결 끊김';
            setTimeout(connectNetwork, 2000);
        };
    }

    function handleServerMessage(msg) {
        if (msg.type === 'ROOM_JOINED') {
            currentRoomId = msg.room_id;
            myPlayerId = msg.player_id;
            roomState = msg.state;
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('arena-section').style.display = 'block';
            updateUI();
        } else if (msg.type === 'STARTING_DRAW') {
            showTurnOrderDrawModal(msg.turn_order_list);
            setTimeout(() => {
                const drawModal = document.getElementById('draw-modal');
                if (drawModal) drawModal.classList.remove('active');
                roomState = msg.state;
                updateUI();
            }, 2500);
        } else if (msg.type === 'ROOM_UPDATED') {
            roomState = msg.state;
            updateUI();
        } else if (msg.type === 'CHAT_MESSAGE') {
            if (roomState && msg.chat) {
                roomState.chat_logs.push(msg.chat);
                renderChatLogs();
            }
        } else if (msg.type === 'ERROR') {
            alert(msg.message);
        }
    }

    function showTurnOrderDrawModal(turnOrderList) {
        const listContainer = document.getElementById('draw-result-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        if (turnOrderList) {
            turnOrderList.forEach(item => {
                const card = document.createElement('div');
                card.className = 'player-card';
                card.innerHTML = `<span>● ${escapeHtml(item.nickname)}</span><span>${item.rank}번째 턴 🎯</span>`;
                listContainer.appendChild(card);
            });
        }
        document.getElementById('draw-modal').classList.add('active');
    }

    function updateUI() {
        if (!roomState) return;

        const status = roomState.status;
        const myPlayer = roomState.players.find(p => p.player_id === myPlayerId);
        const hostBtn = document.getElementById('btn-host-start');
        const readyBtn = document.getElementById('btn-toggle-ready');
        const roomBadge = document.getElementById('room-state-badge');
        const turnBanner = document.getElementById('turn-banner');
        const turnPlayerBadge = document.getElementById('turn-player-badge');

        document.getElementById('display-room-code').innerText = roomState.room_id;
        document.getElementById('display-grid-info').innerText = `턴 제한 시간: ${roomState.turn_time_limit || 60}초`;

        if (status === 'WAITING') {
            if (roomBadge) {
                roomBadge.className = 'room-state-badge waiting';
                roomBadge.innerText = '대기 중';
            }
            if (turnBanner) turnBanner.style.display = 'none';

            if (myPlayer) {
                if (myPlayer.is_host) {
                    document.getElementById('host-controls').style.display = 'block';
                    document.getElementById('btn-toggle-ready').style.display = 'none';
                    const allReady = roomState.players.every(p => p.is_ready);
                    if (hostBtn) {
                        hostBtn.disabled = !allReady;
                        hostBtn.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                    }
                } else {
                    document.getElementById('host-controls').style.display = 'none';
                    if (readyBtn) {
                        readyBtn.style.display = 'inline-block';
                        readyBtn.innerText = myPlayer.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
                    }
                }
            }
        } else {
            if (roomBadge) {
                roomBadge.className = 'room-state-badge playing';
                roomBadge.innerText = '게임 진행 중';
            }
            if (turnBanner) turnBanner.style.display = 'flex';
            document.getElementById('host-controls').style.display = 'none';

            const isMyTurn = (myPlayerId === roomState.current_turn_player_id);
            const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);

            if (turnPlayerBadge) {
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-player-badge my-turn';
                    turnPlayerBadge.innerText = '내 턴입니다! (타일을 내거나 드로우하세요)';
                } else {
                    turnPlayerBadge.className = 'turn-player-badge';
                    turnPlayerBadge.innerHTML = `<span style="color:${turnPlayer?.color || '#000'}; font-weight:bold;">${escapeHtml(turnPlayer?.nickname || '참여자')}</span> 님의 턴`;
                }
            }

            startClientTurnTimer(roomState.turn_time_remaining || roomState.turn_time_limit || 60, roomState.turn_time_limit || 60);
        }

        if (myPlayer) {
            localRack = [...(myPlayer.rack || [])];
        }

        localTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
        renderRack();
        renderTable();
        renderPlayers();
        renderChatLogs();
        renderSystemCalls();
    }

    function startClientTurnTimer(secondsLeft, totalLimit) {
        clearInterval(timerInterval);
        timerSecondsLeft = secondsLeft;
        updateTimerBar(totalLimit);

        timerInterval = setInterval(() => {
            timerSecondsLeft--;
            if (timerSecondsLeft < 0) {
                timerSecondsLeft = 0;
                clearInterval(timerInterval);
            }
            updateTimerBar(totalLimit);
        }, 1000);
    }

    function updateTimerBar(totalLimit) {
        const timerNum = document.getElementById('turn-timer-num');
        const timerFill = document.getElementById('turn-timer-fill');
        if (timerNum) timerNum.innerText = timerSecondsLeft;
        if (timerFill) {
            const pct = Math.max(0, (timerSecondsLeft / (totalLimit || 60)) * 100);
            timerFill.style.width = `${pct}%`;
        }
    }

    function renderRack() {
        const container = document.getElementById('my-rack-container');
        if (!container) return;
        container.innerHTML = '';
        localRack.forEach(tile => {
            const div = document.createElement('div');
            div.className = `rummi-tile tile-${tile.color} ${selectedTiles.includes(tile.id) ? 'selected' : ''}`;
            div.innerText = tile.is_joker ? '★' : tile.number;
            div.addEventListener('click', () => {
                if (selectedTiles.includes(tile.id)) selectedTiles = selectedTiles.filter(id => id !== tile.id);
                else selectedTiles.push(tile.id);
                renderRack();
            });
            container.appendChild(div);
        });
    }

    function renderTable() {
        const container = document.getElementById('table-sets-container');
        if (!container) return;
        container.innerHTML = '';
        localTableSets.forEach(set => {
            const setEl = document.createElement('div');
            setEl.className = 'tile-group-set';
            set.forEach(tile => {
                const div = document.createElement('div');
                div.className = `rummi-tile tile-${tile.color}`;
                div.innerText = tile.is_joker ? '★' : tile.number;
                setEl.appendChild(div);
            });
            container.appendChild(setEl);
        });
    }

    function renderPlayers() {
        const panel = document.getElementById('panel-players');
        const countSpan = document.getElementById('player-count');
        if (!panel || !roomState) return;

        panel.innerHTML = '';
        if (countSpan) countSpan.innerText = roomState.players.length;

        roomState.players.forEach(p => {
            const card = document.createElement('div');
            const isTurnPlayer = (p.player_id === roomState.current_turn_player_id && roomState.status === 'PLAYING');
            card.className = 'player-card' + (isTurnPlayer ? ' active-turn' : '');

            const nickname = String(p.nickname || '참여자');
            const firstLetter = nickname.charAt(0).toUpperCase();
            const avatarColor = p.color || '#6366f1';

            let statusHtml = '';
            if (roomState.status === 'WAITING' || !roomState.status) {
                statusHtml = p.is_ready
                    ? '<span class="ready-tag ready">준비 완료</span>'
                    : '<span class="ready-tag waiting">대기 중...</span>';
            } else {
                statusHtml = `<span>타일 ${p.tile_count || 0}개 ${isTurnPlayer ? '🎯' : ''}</span>`;
            }

            card.innerHTML = `
                <div class="player-info">
                    <div class="player-avatar" style="background-color: ${avatarColor};">${firstLetter}</div>
                    <div class="player-name">
                        ${escapeHtml(nickname)}
                        ${p.is_host ? '<span class="host-tag">방장</span>' : ''}
                    </div>
                </div>
                <div>
                    ${statusHtml}
                </div>
            `;
            panel.appendChild(card);
        });
    }

    function renderChatLogs() {
        const chatBox = document.getElementById('chat-messages');
        if (!chatBox || !roomState) return;
        chatBox.innerHTML = '';
        (roomState.chat_logs || []).forEach(chat => {
            if (chat.system) return;
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.innerHTML = `<span class="sender" style="color:${chat.color}">${escapeHtml(chat.nickname)}:</span> <span>${escapeHtml(chat.text)}</span>`;
            chatBox.appendChild(msgEl);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function renderSystemCalls() {
        const callBox = document.getElementById('panel-calls');
        if (!callBox || !roomState) return;
        callBox.innerHTML = '';
        const systemLogs = (roomState.chat_logs || []).filter(chat => chat.system);
        systemLogs.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'call-item-system';
            item.innerText = chat.text;
            callBox.appendChild(item);
        });
        callBox.scrollTop = callBox.scrollHeight;
    }

    function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

    const createTabBtn = document.getElementById('tab-btn-create');
    const joinTabBtn = document.getElementById('tab-btn-join');
    const createForm = document.getElementById('create-room-form');
    const joinForm = document.getElementById('join-room-form');

    if (createTabBtn && joinTabBtn) {
        createTabBtn.addEventListener('click', () => {
            createTabBtn.classList.add('active');
            joinTabBtn.classList.remove('active');
            if (createForm) createForm.style.display = 'block';
            if (joinForm) joinForm.style.display = 'none';
        });

        joinTabBtn.addEventListener('click', () => {
            joinTabBtn.classList.add('active');
            createTabBtn.classList.remove('active');
            if (joinForm) joinForm.style.display = 'block';
            if (createForm) createForm.style.display = 'none';
        });
    }

    const btnCopyLink = document.getElementById('btn-copy-link');
    if (btnCopyLink) {
        btnCopyLink.addEventListener('click', () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!'))
                .catch(() => prompt('아래 링크를 복사하세요:', shareUrl));
            } else {
                prompt('아래 링크를 복사하세요:', shareUrl);
            }
        });
    }

    const btnShowQr = document.getElementById('btn-show-qr');
    if (btnShowQr) {
        btnShowQr.addEventListener('click', () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            const qrContainer = document.getElementById('qrcode');
            if (qrContainer) {
                qrContainer.innerHTML = '';
                if (typeof QRCode === 'function') {
                    new QRCode(qrContainer, { text: shareUrl, width: 180, height: 180 });
                } else {
                    qrContainer.innerText = shareUrl;
                }
            }
            document.getElementById('qr-modal').classList.add('active');
        });
    }

    const qrModalClose = document.getElementById('qr-modal-close');
    if (qrModalClose) {
        qrModalClose.addEventListener('click', () => {
            document.getElementById('qr-modal').classList.remove('active');
        });
    }

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedTimeLimit = parseInt(e.target.getAttribute('data-time')) || 60;
        });
    });

    document.getElementById('btn-toggle-ready').addEventListener('click', () => {
        socket.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    });

    const hostStartBtn = document.getElementById('btn-host-start');
    if (hostStartBtn) {
        hostStartBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'START_GAME' }));
        });
    }

    const stabChat = document.getElementById('stab-chat');
    const stabCalls = document.getElementById('stab-calls');
    const panelChat = document.getElementById('panel-chat');
    const panelCalls = document.getElementById('panel-calls');

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

    document.getElementById('btn-sort-color').addEventListener('click', () => {
        localRack.sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);
        renderRack();
    });

    document.getElementById('btn-sort-number').addEventListener('click', () => {
        localRack.sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
        renderRack();
    });

    document.getElementById('btn-submit-turn').addEventListener('click', () => {
        if (selectedTiles.length >= 3) {
            const playedSet = localRack.filter(t => selectedTiles.includes(t.id));
            localRack = localRack.filter(t => !selectedTiles.includes(t.id));
            localTableSets.push(playedSet);
            selectedTiles = [];
        }
        socket.send(JSON.stringify({
            type: 'SUBMIT_TURN',
            table_sets: localTableSets,
            rack: localRack
        }));
    });

    document.getElementById('create-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        socket.send(JSON.stringify({
            type: 'CREATE_ROOM',
            game_type: 'RUMMIKUB',
            nickname: document.getElementById('create-nickname').value,
            turn_time_limit: selectedTimeLimit
        }));
    });

    document.getElementById('join-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        socket.send(JSON.stringify({
            type: 'JOIN_ROOM',
            nickname: document.getElementById('join-nickname').value,
            room_id: document.getElementById('join-room-code').value
        }));
    });

    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        if (input.value.trim() && socket) {
            socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', message: input.value.trim() }));
            input.value = '';
        }
    });

    // 실행 초기화
    initStealthMode();
    initNavControls();
    connectNetwork();
})();