/**
 * Office Rummikub Live Client Application Logic - Detach & Reorganize Tile Included
 */

(function () {
    let socket = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let roomState = null;
    let previousTurnPlayerId = null;

    let selectedTiles = []; // 내 거치대 선택 타일 ID 목록
    let selectedTableTile = null; // { setIndex: Number, tileIndex: Number, tile: Object } - 떼어낼 테이블 타일
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

                if (stealthOpacityBox) stealthOpacityBox.style.display = isStealth ? 'flex' : 'none';

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

    function initMobileSidebar() {
        const mobileFabBtn = document.getElementById('mobile-fab-btn');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');

        if (mobileFabBtn && mobileSidebar) {
            mobileFabBtn.onclick = () => mobileSidebar.classList.add('active');
        }
        if (mobileSidebarClose && mobileSidebar) {
            mobileSidebarClose.onclick = () => mobileSidebar.classList.remove('active');
        }
    }

    function initNavControls() {
        const btnHelp = document.getElementById('btn-help');
        const helpModal = document.getElementById('help-modal');
        const helpModalClose = document.getElementById('help-modal-close');
        const soundToggleBtn = document.getElementById('sound-toggle-btn');
        const themeToggleBtn = document.getElementById('theme-toggle-btn');

        if (btnHelp && helpModal) btnHelp.onclick = () => helpModal.classList.add('active');
        if (helpModalClose && helpModal) helpModalClose.onclick = () => helpModal.classList.remove('active');

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
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
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

    function sendMessage(msgDict) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgDict));
        }
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
            showToast(msg.message || '오류가 발생했습니다.');
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
        const hostControls = document.getElementById('host-controls');

        document.getElementById('display-room-code').innerText = roomState.room_id;
        document.getElementById('display-grid-info').innerText = `턴 제한 시간: ${roomState.turn_time_limit || 60}초`;

        const titleEl = document.getElementById('display-topic-title');
        if (titleEl && roomState.title) titleEl.innerText = roomState.title;

        if (status === 'WAITING') {
            if (roomBadge) { roomBadge.className = 'room-state-badge waiting'; roomBadge.innerText = '대기 중'; }
            if (turnBanner) turnBanner.style.display = 'none';

            if (myPlayer) {
                if (readyBtn) {
                    readyBtn.style.display = 'inline-block';
                    readyBtn.innerText = myPlayer.is_ready ? '준비 완료됨 (해제)' : '준비 완료';
                }

                if (myPlayer.is_host) {
                    if (hostControls) hostControls.style.display = 'block';
                    if (hostBtn) {
                        const allReady = roomState.players.every(p => p.is_ready);
                        hostBtn.disabled = !allReady;
                        hostBtn.innerText = allReady ? '게임 시작하기!' : '준비 대기 중...';
                    }
                } else {
                    if (hostControls) hostControls.style.display = 'none';
                }
            }
        } else {
            if (roomBadge) { roomBadge.className = 'room-state-badge playing'; roomBadge.innerText = '게임 진행 중'; }
            if (turnBanner) turnBanner.style.display = 'flex';
            if (hostControls) hostControls.style.display = 'none';

            const isMyTurn = (myPlayerId === roomState.current_turn_player_id);
            const turnPlayer = roomState.players.find(p => p.player_id === roomState.current_turn_player_id);

            if (turnPlayerBadge) {
                if (isMyTurn) {
                    turnPlayerBadge.className = 'turn-player-badge my-turn';
                    turnPlayerBadge.innerText = '내 턴입니다! (타일을 내거나 떼어내세요)';
                } else {
                    turnPlayerBadge.className = 'turn-player-badge';
                    turnPlayerBadge.innerHTML = `<span style="color:${turnPlayer?.color || '#000'}; font-weight:bold;">${escapeHtml(turnPlayer?.nickname || '참여자')}</span> 님의 턴`;
                }
            }

            if (roomState.current_turn_player_id === myPlayerId && previousTurnPlayerId !== myPlayerId) {
                showToast("🧩 당신의 턴입니다! 타일을 조작해보세요!");
            }
            previousTurnPlayerId = roomState.current_turn_player_id;

            startClientTurnTimer(roomState.turn_time_remaining || roomState.turn_time_limit || 60, roomState.turn_time_limit || 60);
        }

        if (myPlayer) localRack = [...(myPlayer.rack || [])];

        localTableSets = JSON.parse(JSON.stringify(roomState.table_sets || []));
        renderRack();
        renderTable();
        renderPlayers();
        renderChatLogs();
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
            const isSel = selectedTiles.includes(tile.id);
            div.className = `rummi-tile tile-${tile.color} ${isSel ? 'selected' : ''}`;
            div.innerText = tile.is_joker ? '★' : tile.number;

            div.onclick = (e) => {
                e.stopPropagation();
                // 테이블 떼기 타일이 선택되어 있다면 떼기 취소
                selectedTableTile = null;

                if (isSel) {
                    selectedTiles = selectedTiles.filter(id => id !== tile.id);
                } else {
                    selectedTiles.push(tile.id);
                }
                renderRack();
                renderTable();
            };
            container.appendChild(div);
        });
    }

    // ★ 테이블 낱개 타일 떼기 및 자유 재조합 연동 ★
    function renderTable() {
        const container = document.getElementById('table-sets-container');
        if (!container) return;
        container.innerHTML = '';

        if (localTableSets.length === 0) {
            const emptyGuide = document.createElement('div');
            emptyGuide.style.cssText = 'width:100%; text-align:center; padding:40px 10px; color:#888; font-size:0.9rem; border:2px dashed #ccc; border-radius:4px;';
            emptyGuide.innerText = selectedTiles.length > 0 
                ? '🧩 선택한 타일을 여기(공유 테이블)를 터치하여 내놓으세요!' 
                : '공유 테이블이 비어있습니다. 내 패에서 타일을 내놓으세요.';
            container.appendChild(emptyGuide);
        }

        localTableSets.forEach((set, setIndex) => {
            const setEl = document.createElement('div');
            setEl.className = 'tile-group-set';

            set.forEach((tile, tileIndex) => {
                const div = document.createElement('div');
                const isSelectedTable = (selectedTableTile && selectedTableTile.setIndex === setIndex && selectedTableTile.tileIndex === tileIndex);
                
                div.className = `rummi-tile tile-${tile.color} ${isSelectedTable ? 'selected' : ''}`;
                if (isSelectedTable) {
                    div.style.borderColor = '#AA0000';
                    div.style.boxShadow = '0 0 10px #AA0000';
                }
                div.innerText = tile.is_joker ? '★' : tile.number;

                // ★ 테이블 위 낱개 타일 터치 시: 해당 타일만 '떼어내기' 선택 ★
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (myPlayerId !== roomState?.current_turn_player_id) {
                        showToast("내 턴일 때만 타일을 조작할 수 있습니다!");
                        return;
                    }

                    // 내 패 선택이 이미 되어있다면 패 덧붙이기 우선
                    if (selectedTiles.length > 0) {
                        appendSelectedRackTilesToSet(setIndex);
                        return;
                    }

                    // 이전에 떼어낸 타일이 있고, 다른 타일을 누른 경우 -> 그 세트로 떼어낸 타일 이동
                    if (selectedTableTile && (selectedTableTile.setIndex !== setIndex || selectedTableTile.tileIndex !== tileIndex)) {
                        moveDetachedTileToSet(setIndex);
                        return;
                    }

                    // 타일 떼어내기 선택 / 해제 토글
                    if (isSelectedTable) {
                        selectedTableTile = null;
                        showToast("타일 떼어내기를 취소했습니다.");
                    } else {
                        selectedTableTile = { setIndex, tileIndex, tile };
                        showToast(`'${tile.number}' 타일을 떼어낼 준비가 되었습니다. 이동할 세트나 빈 공간을 터치하세요!`);
                    }
                    renderTable();
                };

                setEl.appendChild(div);
            });

            if (selectedTiles.length > 0 || selectedTableTile) {
                const guideTag = document.createElement('span');
                guideTag.className = 'append-guide-tag';
                guideTag.innerText = selectedTableTile ? '+ 여기에 떼어 붙이기' : '+ 붙이기';
                setEl.appendChild(guideTag);
            }

            // 세트 박스 자체 터치 시 덧붙이기/이동
            setEl.onclick = (e) => {
                e.stopPropagation();
                if (myPlayerId !== roomState?.current_turn_player_id) return;

                if (selectedTableTile) {
                    moveDetachedTileToSet(setIndex);
                } else if (selectedTiles.length > 0) {
                    appendSelectedRackTilesToSet(setIndex);
                }
            };

            container.appendChild(setEl);
        });

        // 빈 공간 클릭 시: 떼어낸 타일로 '새 세트' 생성 또는 내 거치대 선택 타일로 새 세트 생성
        container.onclick = (e) => {
            if (myPlayerId !== roomState?.current_turn_player_id) return;

            if (selectedTableTile) {
                // 떼어낸 1장만으로는 새 세트 못 만듦 (최소 3장 필요)
                showToast("타일 1장만으로는 새 세트를 만들 수 없습니다. 다른 세트에 붙이거나 내 패의 타일과 조합하세요!");
                return;
            }

            if (selectedTiles.length > 0) {
                if (selectedTiles.length < 3) {
                    showToast("새로운 세트를 내놓으려면 최소 3장 이상의 타일을 선택해야 합니다!");
                    return;
                }

                const playedTiles = localRack.filter(t => selectedTiles.includes(t.id));
                localRack = localRack.filter(t => !selectedTiles.includes(t.id));

                localTableSets.push(playedTiles);
                selectedTiles = [];

                showToast("공유 테이블에 새로운 세트 타일을 내놓았습니다!");
                renderRack();
                renderTable();
            }
        };
    }

    // 내 거치대 선택 타일들을 특정 세트에 덧붙이기
    function appendSelectedRackTilesToSet(targetSetIndex) {
        const playedTiles = localRack.filter(t => selectedTiles.includes(t.id));
        localRack = localRack.filter(t => !selectedTiles.includes(t.id));

        localTableSets[targetSetIndex] = [...localTableSets[targetSetIndex], ...playedTiles];
        selectedTiles = [];

        showToast("테이블의 기존 세트에 타일을 덧붙였습니다!");
        renderRack();
        renderTable();
    }

    // 떼어낸 테이블 타일을 다른 세트로 이동
    function moveDetachedTileToSet(targetSetIndex) {
        if (!selectedTableTile) return;
        const { setIndex, tileIndex, tile } = selectedTableTile;

        // 원본 세트에서 제거
        localTableSets[setIndex].splice(tileIndex, 1);
        // 빈 세트가 되면 세트 삭제
        if (localTableSets[setIndex].length === 0) {
            localTableSets.splice(setIndex, 1);
            if (targetSetIndex > setIndex) targetSetIndex--;
        }

        // 대상 세트에 추가
        localTableSets[targetSetIndex].push(tile);
        selectedTableTile = null;

        showToast("타일을 성공적으로 떼어내어 다른 세트에 붙였습니다!");
        renderRack();
        renderTable();
    }

    function renderPlayers() {
        const panel = document.getElementById('panel-players');
        const countSpan = document.getElementById('player-count');
        const mobilePlayerCount = document.getElementById('mobile-player-count');
        if (!panel || !roomState) return;

        panel.innerHTML = '';
        if (countSpan) countSpan.innerText = roomState.players.length;
        if (mobilePlayerCount) mobilePlayerCount.innerText = roomState.players.length;

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
                    : '<span class="ready-tag waiting">작성 중...</span>';
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
                <div>${statusHtml}</div>
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

    function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

    function initGlobalClickDelegation() {
        document.addEventListener('click', (e) => {
            const timeBtn = e.target.closest('.time-btn');
            if (timeBtn) {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
                timeBtn.classList.add('selected');
                selectedTimeLimit = parseInt(timeBtn.getAttribute('data-time')) || 60;
                return;
            }

            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                const createForm = document.getElementById('create-room-form');
                const joinForm = document.getElementById('join-room-form');
                const tabBtnCreate = document.getElementById('tab-btn-create');
                const tabBtnJoin = document.getElementById('tab-btn-join');

                if (tabBtn.id === 'tab-btn-create') {
                    if (tabBtnCreate) tabBtnCreate.classList.add('active');
                    if (tabBtnJoin) tabBtnJoin.classList.remove('active');
                    if (createForm) createForm.style.display = 'block';
                    if (joinForm) joinForm.style.display = 'none';
                } else if (tabBtn.id === 'tab-btn-join') {
                    if (tabBtnJoin) tabBtnJoin.classList.add('active');
                    if (tabBtnCreate) tabBtnCreate.classList.remove('active');
                    if (joinForm) joinForm.style.display = 'block';
                    if (createForm) createForm.style.display = 'none';
                }
                return;
            }
        });
    }

    function initGameControls() {
        const btnToggleReady = document.getElementById('btn-toggle-ready');
        const hostStartBtn = document.getElementById('btn-host-start');
        const btnHostReset = document.getElementById('btn-host-reset');
        const btnResetConfirm = document.getElementById('btn-reset-confirm');
        const btnResetCancel = document.getElementById('btn-reset-cancel');
        const resetOptionModal = document.getElementById('reset-option-modal');

        const btnSortColor = document.getElementById('btn-sort-color');
        const btnSortNumber = document.getElementById('btn-sort-number');
        const btnSubmitTurn = document.getElementById('btn-submit-turn');
        const btnCopyLink = document.getElementById('btn-copy-link');
        const btnShowQr = document.getElementById('btn-show-qr');
        const qrModal = document.getElementById('qr-modal');
        const qrModalClose = document.getElementById('qr-modal-close');

        if (btnToggleReady) btnToggleReady.onclick = () => sendMessage({ type: 'TOGGLE_READY' });
        if (hostStartBtn) hostStartBtn.onclick = () => sendMessage({ type: 'START_GAME' });

        if (btnHostReset) btnHostReset.onclick = () => { if (resetOptionModal) resetOptionModal.classList.add('active'); };
        if (btnResetConfirm) {
            btnResetConfirm.onclick = () => {
                sendMessage({ type: 'RESET_GAME', room_id: currentRoomId, player_id: myPlayerId });
                if (resetOptionModal) resetOptionModal.classList.remove('active');
            };
        }
        if (btnResetCancel) btnResetCancel.onclick = () => { if (resetOptionModal) resetOptionModal.classList.remove('active'); };

        if (btnSortColor) {
            btnSortColor.onclick = () => {
                localRack.sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);
                renderRack();
                showToast("타일을 색상별로 정렬했습니다.");
            };
        }

        if (btnSortNumber) {
            btnSortNumber.onclick = () => {
                localRack.sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
                renderRack();
                showToast("타일을 숫자별로 정렬했습니다.");
            };
        }

        if (btnSubmitTurn) {
            btnSubmitTurn.onclick = () => {
                if (myPlayerId !== roomState?.current_turn_player_id) {
                    showToast("내 턴일 때만 턴을 완료할 수 있습니다!");
                    return;
                }

                if (selectedTiles.length > 0) {
                    if (selectedTiles.length < 3) {
                        showToast("새 세트를 내놓으려면 최소 3장 이상의 타일을 선택해야 합니다!");
                        return;
                    }
                    const playedTiles = localRack.filter(t => selectedTiles.includes(t.id));
                    localRack = localRack.filter(t => !selectedTiles.includes(t.id));
                    localTableSets.push(playedTiles);
                    selectedTiles = [];
                }

                sendMessage({ type: 'SUBMIT_TURN', table_sets: localTableSets, rack: localRack });
            };
        }

        if (btnCopyLink) {
            btnCopyLink.onclick = () => {
                const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
                if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!'));
                else prompt('아래 링크를 복사하세요:', shareUrl);
            };
        }

        if (btnShowQr) {
            btnShowQr.onclick = () => {
                const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
                const qrContainer = document.getElementById('qrcode');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    if (typeof QRCode === 'function') new QRCode(qrContainer, { text: shareUrl, width: 180, height: 180 });
                    else qrContainer.innerText = shareUrl;
                }
                if (qrModal) qrModal.classList.add('active');
            };
        }

        if (qrModalClose && qrModal) qrModalClose.onclick = () => qrModal.classList.remove('active');

        const stabChat = document.getElementById('stab-chat');
        const stabCalls = document.getElementById('stab-calls');
        const panelChat = document.getElementById('panel-chat');
        const panelCalls = document.getElementById('panel-calls');

        if (stabChat && stabCalls) {
            stabChat.onclick = () => {
                stabChat.classList.add('active'); stabCalls.classList.remove('active');
                if (panelChat) panelChat.style.display = 'flex';
                if (panelCalls) panelCalls.style.display = 'none';
            };
            stabCalls.onclick = () => {
                stabCalls.classList.add('active'); stabChat.classList.remove('active');
                if (panelCalls) panelCalls.style.display = 'flex';
                if (panelChat) panelChat.style.display = 'none';
            };
        }
    }

    function initFormControls() {
        const createForm = document.getElementById('create-room-form');
        const joinForm = document.getElementById('join-room-form');

        if (createForm) {
            createForm.onsubmit = (e) => {
                e.preventDefault();
                const customTitle = document.getElementById('create-title') ? document.getElementById('create-title').value.trim() : '레트로 실시간 루미큐브';
                sendMessage({
                    type: 'CREATE_ROOM', game_type: 'RUMMIKUB',
                    title: customTitle,
                    nickname: document.getElementById('create-nickname').value,
                    turn_time_limit: selectedTimeLimit
                });
            };
        }

        if (joinForm) {
            joinForm.onsubmit = (e) => {
                e.preventDefault();
                sendMessage({
                    type: 'JOIN_ROOM', nickname: document.getElementById('join-nickname').value,
                    room_id: document.getElementById('join-room-code').value
                });
            };
        }

        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        if (chatForm) {
            chatForm.onsubmit = (e) => {
                e.preventDefault();
                if (chatInput && chatInput.value.trim()) {
                    sendMessage({ type: 'CHAT_MESSAGE', message: chatInput.value.trim() });
                    chatInput.value = '';
                }
            };
        }
    }

    // 실행 초기화
    initStealthMode();
    initMobileSidebar();
    initNavControls();
    initGlobalClickDelegation();
    initFormControls();
    initGameControls();
    connectNetwork();
})();