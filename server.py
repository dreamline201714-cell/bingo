#!/usr/bin/env python3
"""
Office Games Live Unified Server (Bingo + Rummikub + Seotda)
"""

import asyncio
import http
import json
import mimetypes
import os
import random
import string
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = int(os.environ.get("PORT", 8000))
PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))
TURN_DURATION_SECONDS = 15

AVATAR_COLORS = [
    "#E53935", "#1E88E5", "#43A047", "#FB8C00", 
    "#8E44AD", "#00ACC1", "#D81B60", "#6D4C41"
]

SEOTDA_CARDS_DECK = [
    {'id': 'c_1_1', 'month': 1, 'is_kwang': True, 'name': '1월 광'},
    {'id': 'c_1_2', 'month': 1, 'is_kwang': False, 'name': '1월 피'},
    {'id': 'c_2_1', 'month': 2, 'is_kwang': False, 'name': '2월 십'},
    {'id': 'c_2_2', 'month': 2, 'is_kwang': False, 'name': '2월 피'},
    {'id': 'c_3_1', 'month': 3, 'is_kwang': True, 'name': '3월 광'},
    {'id': 'c_3_2', 'month': 3, 'is_kwang': False, 'name': '3월 피'},
    {'id': 'c_4_1', 'month': 4, 'is_kwang': False, 'name': '4월 십'},
    {'id': 'c_4_2', 'month': 4, 'is_kwang': False, 'name': '4월 피'},
    {'id': 'c_5_1', 'month': 5, 'is_kwang': False, 'name': '5월 십'},
    {'id': 'c_5_2', 'month': 5, 'is_kwang': False, 'name': '5월 피'},
    {'id': 'c_6_1', 'month': 6, 'is_kwang': False, 'name': '6월 십'},
    {'id': 'c_6_2', 'month': 6, 'is_kwang': False, 'name': '6월 피'},
    {'id': 'c_7_1', 'month': 7, 'is_kwang': False, 'name': '7월 십'},
    {'id': 'c_7_2', 'month': 7, 'is_kwang': False, 'name': '7월 피'},
    {'id': 'c_8_1', 'month': 8, 'is_kwang': True, 'name': '8월 광'},
    {'id': 'c_8_2', 'month': 8, 'is_kwang': False, 'name': '8월 피'},
    {'id': 'c_9_1', 'month': 9, 'is_kwang': False, 'name': '9월 십'},
    {'id': 'c_9_2', 'month': 9, 'is_kwang': False, 'name': '9월 피'},
    {'id': 'c_10_1', 'month': 10, 'is_kwang': False, 'name': '10월 십'},
    {'id': 'c_10_2', 'month': 10, 'is_kwang': False, 'name': '10월 피'},
]

ROOMS = {}

def generate_room_code(length=6):
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choice(chars) for _ in range(length))
        if code not in ROOMS: return code

def get_unique_color(used_colors):
    available = [c for c in AVATAR_COLORS if c not in used_colors]
    if available: return random.choice(available)
    return '#' + ''.join(random.choices('0123456789ABCDEF', k=6))

def calculate_bingo_lines(board, marked_indices, size):
    if not board or len(board) < size * size: return 0
    marked_set = set(marked_indices)
    lines = 0
    for r in range(size):
        if all((r * size + c) in marked_set for c in range(size)): lines += 1
    for c in range(size):
        if all((r * size + c) in marked_set for r in range(size)): lines += 1
    if all((i * size + i) in marked_set for i in range(size)): lines += 1
    if all((i * size + (size - 1 - i)) in marked_set for i in range(size)): lines += 1
    return lines

def generate_player_board(word_pool, size):
    total_cells = size * size
    words = list(word_pool) if word_pool else []
    if len(words) < total_cells:
        extra_needed = total_cells - len(words)
        for i in range(1, extra_needed + 1): words.append(f"단어 {i}")
    return random.sample(words, len(words))[:total_cells]

def evaluate_seotda_hand(card1, card2):
    m1, m2 = card1['month'], card2['month']
    kw1, kw2 = card1['is_kwang'], card2['is_kwang']
    
    if kw1 and kw2:
        if (m1 == 3 and m2 == 8) or (m1 == 8 and m2 == 3): return (1000, "삼팔광땡 👑", "3·8 광땡")
        if (m1 == 1 and m2 == 8) or (m1 == 8 and m2 == 1): return (990, "일팔광땡 🌟", "1·8 광땡")
        if (m1 == 1 and m2 == 3) or (m1 == 3 and m2 == 1): return (980, "일삼광땡 🌟", "1·3 광땡")

    if m1 == m2:
        rank_name = f"{m1}땡" if m1 != 10 else "장땡 🔥"
        return (800 + m1 * 10, rank_name, f"{m1}땡")

    months = tuple(sorted([m1, m2]))
    special_hands = {
        (1, 2): (760, "알통 💪"), (1, 4): (750, "독사 🐍"), (4, 9): (740, "구빙 ❄️"),
        (6, 10): (730, "장빙 🧊"), (4, 10): (720, "장사 🐯"), (4, 6): (710, "세륙 ⚡")
    }
    if months in special_hands:
        score, name = special_hands[months]
        return (score, name, name)

    digit_sum = (m1 + m2) % 10
    if digit_sum == 9: return (100 + digit_sum, "갑오 (9끗) ✨", "갑오")
    elif digit_sum == 0: return (100, "망통 (0끗) 😭", "망통")
    else: return (100 + digit_sum, f"{digit_sum}끗", f"{digit_sum}끗")

def start_seotda_round(room):
    deck = list(SEOTDA_CARDS_DECK)
    random.shuffle(deck)
    room['deck'] = deck
    room['pot'] = 0
    base_ante = room.get('base_ante', 100)
    room['last_bet_amount'] = base_ante
    room['betting_turns'] = 0

    all_ws = list(room['players'].keys())
    if 'dealer_ws' in room and room['dealer_ws'] in all_ws:
        dealer_idx = all_ws.index(room['dealer_ws'])
        room['turn_order'] = all_ws[dealer_idx:] + all_ws[:dealer_idx]
    else:
        room['turn_order'] = all_ws

    room['current_turn_index'] = 0

    for p_ws, p in room['players'].items():
        p['is_folded'] = False
        p['current_bet'] = base_ante
        p['chips'] = max(0, p['chips'] - base_ante)
        room['pot'] += base_ante
        c1, c2 = room['deck'].pop(), room['deck'].pop()
        p['hand'] = [c1, c2]
        score, jokbo_full, jokbo_short = evaluate_seotda_hand(c1, c2)
        p['jokbo_score'] = score
        p['jokbo_name'] = jokbo_full

    room['chat_logs'].append({'system': True, 'text': f"🎴 새로운 판이 시작되었습니다! (학교값 {base_ante}칩 차감)"})

def serialize_room_state(room_id, requester_ws=None):
    if room_id not in ROOMS: return None
    room = ROOMS[room_id]
    game_type = room['game_type']
    players_data = []

    current_ws = room['turn_order'][room['current_turn_index']] if room.get('turn_order') else None
    current_player_id = room['players'][current_ws]['id'] if current_ws and current_ws in room['players'] else None

    turn_time_limit = room.get('turn_time_limit', TURN_DURATION_SECONDS)
    time_left = turn_time_limit
    if room['status'] == 'PLAYING' and room.get('turn_start_time'):
        elapsed = int(time.time() - room['turn_start_time'])
        time_left = max(0, turn_time_limit - elapsed)

    for ws, player in room['players'].items():
        p_info = {
            'player_id': player['id'], 'nickname': player['nickname'],
            'is_host': player['is_host'], 'is_ready': player.get('is_ready', False),
            'color': player['color'], 'is_current_turn': (player['id'] == current_player_id)
        }
        if game_type == 'BINGO':
            p_info.update({
                'is_escaped': player.get('is_escaped', False),
                'score': player.get('score', 0),
                'board': player.get('board', []),
                'marked': list(player.get('marked', []))
            })
        elif game_type == 'RUMMIKUB':
            p_info.update({'tile_count': len(player.get('rack', [])), 'rack': player.get('rack', []) if requester_ws == ws else []})
        elif game_type == 'SEOTDA':
            hand = player.get('hand', [])
            # 쇼다운 상태이거나 내 패일 경우만 공개
            visible_hand = hand if requester_ws == ws or room['status'] == 'SHOWDOWN' else [{'month': 0, 'is_kwang': False, 'name': '비공개'} for _ in hand]
            p_info.update({
                'chips': player.get('chips', 10000), 'current_bet': player.get('current_bet', 0),
                'is_folded': player.get('is_folded', False), 'hand': visible_hand,
                'jokbo_name': player.get('jokbo_name', '') if (requester_ws == ws or room['status'] == 'SHOWDOWN') else ''
            })
        players_data.append(p_info)

    state = {
        'room_id': room_id, 'game_type': game_type, 'status': room['status'],
        'title': room.get('title', '레트로 멀티 미니게임'),
        'current_turn_player_id': current_player_id, 'turn_time_limit': turn_time_limit,
        'turn_time_remaining': time_left, 'players': players_data, 'chat_logs': room['chat_logs'][-30:]
    }

    if game_type == 'BINGO':
        state['config'] = room.get('config', {})
    elif game_type == 'RUMMIKUB':
        state['table_sets'] = room.get('table_sets', [])
    elif game_type == 'SEOTDA':
        state['pot'] = room.get('pot', 0)
        state['last_bet_amount'] = room.get('last_bet_amount', 0)
        state['start_chips'] = room.get('start_chips', 10000)
        state['base_ante'] = room.get('base_ante', 100)
        state['dealer_player_id'] = room['players'][room['dealer_ws']]['id'] if 'dealer_ws' in room and room['dealer_ws'] in room['players'] else None

    return state

async def broadcast_to_room(room_id, message_dict):
    if room_id not in ROOMS: return
    for ws in list(ROOMS[room_id]['players'].keys()):
        try:
            personalized_msg = dict(message_dict)
            if 'state' in personalized_msg:
                personalized_msg['state'] = serialize_room_state(room_id, requester_ws=ws)
            if hasattr(ws, 'send_json'): await ws.send_json(personalized_msg)
            else: await ws.send(json.dumps(personalized_msg, ensure_ascii=False))
        except Exception: pass

async def process_client_msg(ws, current_player_id, data, current_room_id):
    msg_type = data.get('type')

    if msg_type == 'CREATE_ROOM':
        game_type = data.get('game_type', 'BINGO')
        nickname = str(data.get('nickname', '방장')).strip() or '방장'
        room_id = generate_room_code()
        assigned_color = get_unique_color([])
        title = str(data.get('title', '레트로 실시간 게임')).strip() or '레트로 실시간 게임'

        if game_type == 'BINGO':
            size = int(data.get('size', 5))
            ROOMS[room_id] = {
                'game_type': 'BINGO', 'status': 'WAITING', 'turn_time_limit': TURN_DURATION_SECONDS, 'title': title,
                'config': {'size': size, 'target_lines': int(data.get('target_lines', size)), 'topic': data.get('topic', '자유 주제').strip() or '자유 주제', 'word_pool': data.get('word_pool', [])},
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'color': assigned_color, 'board': generate_player_board(data.get('word_pool', []), size), 'marked': set(), 'score': 0}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }
        elif game_type == 'RUMMIKUB':
            ROOMS[room_id] = {
                'game_type': 'RUMMIKUB', 'status': 'WAITING', 'turn_time_limit': int(data.get('turn_time_limit', 60)), 'title': title,
                'deck': [], 'table_sets': [],
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'rack': [], 'color': assigned_color}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }
        elif game_type == 'SEOTDA':
            start_chips = int(data.get('start_chips', 10000))
            base_ante = int(data.get('base_ante', 100))
            ROOMS[room_id] = {
                'game_type': 'SEOTDA', 'status': 'WAITING', 'turn_time_limit': 15, 'title': title,
                'start_chips': start_chips, 'base_ante': base_ante,
                'pot': 0, 'last_bet_amount': base_ante, 'deck': [],
                'players': {ws: {'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False, 'color': assigned_color, 'chips': start_chips, 'current_bet': 0, 'is_folded': False, 'hand': []}},
                'turn_order': [], 'current_turn_index': 0, 'chat_logs': []
            }

        res = {'type': 'ROOM_JOINED', 'room_id': room_id, 'game_type': game_type, 'player_id': current_player_id, 'is_host': True, 'state': serialize_room_state(room_id, requester_ws=ws)}
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))
        return room_id

    elif msg_type == 'JOIN_ROOM':
        room_id = data.get('room_id', '').upper().strip()
        nickname = str(data.get('nickname', '참여자')).strip() or '참여자'

        if room_id not in ROOMS:
            err = {'type': 'ERROR', 'message': '존재하지 않는 방 코드입니다.'}
            if hasattr(ws, 'send_json'): await ws.send_json(err)
            else: await ws.send(json.dumps(err, ensure_ascii=False))
            return current_room_id

        room = ROOMS[room_id]
        game_type = room['game_type']
        assigned_color = get_unique_color([p['color'] for p in room['players'].values()])

        if game_type == 'BINGO':
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'color': assigned_color, 'board': generate_player_board(room['config']['word_pool'], room['config']['size']), 'marked': set(), 'score': 0}
        elif game_type == 'RUMMIKUB':
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'rack': [], 'color': assigned_color}
        elif game_type == 'SEOTDA':
            start_chips = room.get('start_chips', 10000)
            room['players'][ws] = {'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False, 'color': assigned_color, 'chips': start_chips, 'current_bet': 0, 'is_folded': False, 'hand': []}

        room['chat_logs'].append({'system': True, 'text': f"🎉 '{nickname}'님이 입장하셨습니다."})
        res = {'type': 'ROOM_JOINED', 'room_id': room_id, 'game_type': game_type, 'player_id': current_player_id, 'is_host': False, 'state': serialize_room_state(room_id, requester_ws=ws)}
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))
        await broadcast_to_room(room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return room_id

    elif msg_type == 'START_GAME':
        room = ROOMS.get(current_room_id)
        if not room or not room['players'][ws]['is_host']: return current_room_id

        room['status'] = 'PLAYING'
        player_sockets = list(room['players'].keys())
        
        if room['game_type'] == 'SEOTDA':
            room['dealer_ws'] = ws # 방장이 최초의 '선'이 됨
            start_seotda_round(room)
        else:
            random.shuffle(player_sockets)
            room['turn_order'] = player_sockets
            room['current_turn_index'] = 0
            if room['game_type'] == 'RUMMIKUB':
                deck = [] # ... 루미큐브 덱 제너레이터 연동 등 기존과 동일
                room['chat_logs'].append({'system': True, 'text': "🧩 루미큐브가 시작되었습니다!"})

        room['turn_start_time'] = time.time()
        turn_order_list = [{'rank': idx + 1, 'nickname': room['players'][s]['nickname'], 'color': room['players'][s]['color']} for idx, s in enumerate(room['turn_order'])]
        
        await broadcast_to_room(current_room_id, {'type': 'STARTING_DRAW', 'turn_order_list': turn_order_list, 'state': None})

    # ★ 섯다 라운드 연속 진행 (전판 승자가 패 나누기) ★
    elif msg_type == 'START_ROUND':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'SEOTDA' and room['status'] == 'SHOWDOWN':
            if ws == room.get('dealer_ws'):
                room['status'] = 'PLAYING'
                start_seotda_round(room)
                room['turn_start_time'] = time.time()
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    # ★ 섯다 배팅 로직 및 쇼다운(라운드 종료) 엔진 연동 ★
    elif msg_type == 'SEOTDA_BET':
        room = ROOMS.get(current_room_id)
        if room and room['game_type'] == 'SEOTDA' and room['status'] == 'PLAYING':
            current_ws = room['turn_order'][room['current_turn_index']]
            if ws == current_ws:
                action = data.get('action')
                player = room['players'][ws]
                base_ante = room.get('base_ante', 100)
                
                bet_add = 0
                if action == 'DIE':
                    player['is_folded'] = True
                    room['chat_logs'].append({'system': True, 'text': f"😭 [{player['nickname']}]님이 다이(기권)하셨습니다."})
                else:
                    active_players = [p for p in room['players'].values() if not p['is_folded']]
                    target_bet = max(p['current_bet'] for p in active_players) if active_players else player['current_bet']
                    
                    if action == 'BING': 
                        bet_add = base_ante
                    elif action == 'TADANG': 
                        bet_add = (target_bet - player['current_bet']) + room['last_bet_amount'] * 2
                    elif action == 'HALF': 
                        bet_add = (target_bet - player['current_bet']) + int(room['pot'] * 0.5)
                    elif action == 'CALL': 
                        bet_add = target_bet - player['current_bet']
                    
                    if bet_add <= 0 and action != 'BING': bet_add = 0
                
                if action != 'DIE':
                    bet_add = min(player['chips'], max(bet_add, 0))
                    player['chips'] -= bet_add
                    player['current_bet'] += bet_add
                    room['pot'] += bet_add
                    if bet_add > 0 and action != 'CALL':
                        room['last_bet_amount'] = bet_add
                    room['chat_logs'].append({'system': True, 'text': f"💸 [{player['nickname']}]님이 [{action}] ({bet_add}칩) 배팅!"})

                room['betting_turns'] = room.get('betting_turns', 0) + 1
                active_ws = [p_ws for p_ws, p in room['players'].items() if not p['is_folded']]
                
                # 라운드 종료 (1명 생존 시)
                if len(active_ws) == 1:
                    winner_ws = active_ws[0]
                    winner = room['players'][winner_ws]
                    winner['chips'] += room['pot']
                    room['dealer_ws'] = winner_ws # 승자가 다음 판 선
                    room['chat_logs'].append({'system': True, 'text': f"🎉 모두 기권하여 [{winner['nickname']}]님이 {room['pot']} 칩을 획득했습니다!"})
                    room['status'] = 'SHOWDOWN'
                else:
                    # 라운드 종료 (모두 배팅 금액 일치 시 = 콜)
                    max_current_bet = max(room['players'][aw]['current_bet'] for aw in active_ws)
                    all_matched = all(room['players'][aw]['current_bet'] == max_current_bet for aw in active_ws)
                    
                    if all_matched and room['betting_turns'] >= len(active_ws):
                        active_players = [room['players'][aw] for aw in active_ws]
                        active_players.sort(key=lambda x: x['jokbo_score'], reverse=True)
                        winner = active_players[0]
                        winner_ws = [w for w, p in room['players'].items() if p['id'] == winner['id']][0]
                        
                        winner['chips'] += room['pot']
                        room['dealer_ws'] = winner_ws # 승자가 다음 판 선
                        room['chat_logs'].append({'system': True, 'text': f"🏆 쪼기 결과! [{winner['nickname']}]님이 '{winner['jokbo_name']}'(으)로 {room['pot']} 칩 획득!"})
                        room['status'] = 'SHOWDOWN'
                    else:
                        next_idx = (room['current_turn_index'] + 1) % len(room['turn_order'])
                        while room['players'][room['turn_order'][next_idx]]['is_folded']:
                            next_idx = (next_idx + 1) % len(room['turn_order'])
                        room['current_turn_index'] = next_idx
                        room['turn_start_time'] = time.time()

                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'TOGGLE_READY':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players']:
            p = room['players'][ws]
            p['is_ready'] = not p.get('is_ready', False)
            status_str = "준비 완료" if p['is_ready'] else "준비 해제"
            room['chat_logs'].append({'system': True, 'text': f"✋ '{p['nickname']}'님이 {status_str}하셨습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'CHAT_MESSAGE':
        room = ROOMS.get(current_room_id)
        if room:
            p = room['players'].get(ws)
            text = str(data.get('message', '')).strip()
            if text:
                msg_obj = {'system': False, 'nickname': p['nickname'] if p else '익명', 'color': p['color'] if p else '#ccc', 'text': text}
                room['chat_logs'].append(msg_obj)
                await broadcast_to_room(current_room_id, {'type': 'CHAT_MESSAGE', 'chat': msg_obj})

    return current_room_id

try:
    from aiohttp import web
    async def aiohttp_ws_handler(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        current_room_id = None
        current_player_id = str(id(ws))
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    current_room_id = await process_client_msg(ws, current_player_id, data, current_room_id)
        finally:
            if current_room_id and current_room_id in ROOMS:
                room = ROOMS[current_room_id]
                if ws in room['players']:
                    room['players'].pop(ws)
                    if ws in room['turn_order']: room['turn_order'].remove(ws)
                    if not room['players']: del ROOMS[current_room_id]
                    else: await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return ws

    async def handle_static_files(request):
        path = request.path
        file_path = os.path.join(PUBLIC_DIR, 'index.html') if path in ('/', '/index.html') else os.path.join(PUBLIC_DIR, path.lstrip('/'))
        if os.path.exists(file_path) and os.path.isfile(file_path): return web.FileResponse(file_path)
        return web.FileResponse(os.path.join(PUBLIC_DIR, 'index.html'))

    def run_aiohttp_server():
        print(f" [INFO] Office Games Live Server running on port {PORT}")
        app = web.Application()
        app.router.add_get('/ws', aiohttp_ws_handler)
        app.router.add_get('/{tail:.*}', handle_static_files)
        web.run_app(app, host='0.0.0.0', port=PORT)

    if __name__ == '__main__':
        run_aiohttp_server()
except ImportError:
    print("[ERROR] aiohttp module is required.")