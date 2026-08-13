#!/usr/bin/env python3
"""
Office Games Live Unified Server (Bingo + Rummikub)
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
TILE_COLORS = ["red", "blue", "black", "orange"]

ROOMS = {}

def generate_room_code(length=6):
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choice(chars) for _ in range(length))
        if code not in ROOMS:
            return code

def get_unique_color(used_colors):
    available = [c for c in AVATAR_COLORS if c not in used_colors]
    if available:
        return random.choice(available)
    return '#' + ''.join(random.choices('0123456789ABCDEF', k=6))

# --- BINGO LOGIC ---
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

# --- RUMMIKUB LOGIC ---
def create_full_deck():
    deck = []
    tile_id = 1
    for color in TILE_COLORS:
        for number in range(1, 14):
            for _ in range(2):
                deck.append({'id': f"t_{tile_id}", 'color': color, 'number': number, 'is_joker': False})
                tile_id += 1
    deck.append({'id': f"t_{tile_id}", 'color': 'joker', 'number': 0, 'is_joker': True})
    tile_id += 1
    deck.append({'id': f"t_{tile_id}", 'color': 'joker', 'number': 0, 'is_joker': True})
    random.shuffle(deck)
    return deck

def is_valid_group(tiles):
    if len(tiles) not in (3, 4): return False
    normals = [t for t in tiles if not t.get('is_joker')]
    if not normals: return True
    target_num = normals[0]['number']
    if any(t['number'] != target_num for t in normals): return False
    used_colors = set(t['color'] for t in normals)
    if len(used_colors) != len(normals): return False
    return True

def is_valid_run(tiles):
    if len(tiles) < 3: return False
    normals = [t for t in tiles if not t.get('is_joker')]
    if not normals: return True
    run_color = normals[0]['color']
    if any(t['color'] != run_color for t in normals): return False
    n = len(tiles)
    for start_num in range(1, 14 - n + 2):
        valid = True
        for i in range(n):
            tile = tiles[i]
            expected_num = start_num + i
            if expected_num > 13 or (not tile.get('is_joker') and tile['number'] != expected_num):
                valid = False; break
        if valid: return True
    return False

def is_valid_set(tiles):
    return is_valid_group(tiles) or is_valid_run(tiles)

def calculate_set_score(tiles):
    score = 0
    normals = [t for t in tiles if not t.get('is_joker')]
    if not normals: return 30
    if is_valid_group(tiles):
        score = normals[0]['number'] * len(tiles)
    elif is_valid_run(tiles):
        n = len(tiles)
        for start_num in range(1, 14 - n + 2):
            valid = True
            for i in range(n):
                tile = tiles[i]
                expected_num = start_num + i
                if expected_num > 13 or (not tile.get('is_joker') and tile['number'] != expected_num):
                    valid = False; break
            if valid:
                score = sum(start_num + i for i in range(n))
                break
    return score

# --- SERIALIZER ---
def serialize_room_state(room_id, requester_ws=None):
    if room_id not in ROOMS: return None
    room = ROOMS[room_id]
    game_type = room['game_type']
    players_data = []

    current_ws = room['turn_order'][room['current_turn_index']] if room['turn_order'] else None
    current_player_id = room['players'][current_ws]['id'] if current_ws and current_ws in room['players'] else None

    turn_time_limit = room.get('turn_time_limit', TURN_DURATION_SECONDS)
    time_left = turn_time_limit
    if room['status'] == 'PLAYING' and room.get('turn_start_time'):
        elapsed = int(time.time() - room['turn_start_time'])
        time_left = max(0, turn_time_limit - elapsed)

    for ws, player in room['players'].items():
        p_info = {
            'player_id': player['id'],
            'nickname': player['nickname'],
            'is_host': player['is_host'],
            'is_ready': player.get('is_ready', False),
            'color': player['color'],
            'is_current_turn': (player['id'] == current_player_id)
        }
        if game_type == 'BINGO':
            # 본인의 보드만 단어 포함, 타인의 보드는 관전용 마스킹 처리(단어 숨김)
            if requester_ws == ws:
                p_board = player.get('board', [])
            else:
                # 관전 모드용: 단어 숨김 (체크 여부 판별용 '★' 처리)
                p_board = ['★' if idx in player.get('marked', set()) else '' for idx in range(len(player.get('board', [])))]

            p_info.update({
                'is_escaped': player.get('is_escaped', False),
                'escape_rank': player.get('escape_rank', 0),
                'is_loser': player.get('is_loser', False),
                'score': player.get('score', 0),
                'marked_count': len(player.get('marked', [])),
                'board': p_board,
                'marked': list(player.get('marked', []))
            })
        else: # RUMMIKUB
            p_info.update({
                'has_initial_meld': player.get('has_initial_meld', False),
                'tile_count': len(player.get('rack', [])),
                'rack': player.get('rack', []) if requester_ws == ws else []
            })
        players_data.append(p_info)

    state = {
        'room_id': room_id,
        'game_type': game_type,
        'status': room['status'],
        'current_turn_player_id': current_player_id,
        'turn_time_limit': turn_time_limit,
        'turn_time_remaining': time_left,
        'players': players_data,
        'chat_logs': room['chat_logs'][-30:]
    }

    if game_type == 'BINGO':
        state['config'] = room.get('config', {})
        state['called_items'] = room.get('called_items', [])
    else:
        state['deck_count'] = len(room.get('deck', []))
        state['table_sets'] = room.get('table_sets', [])

    return state

async def broadcast_to_room(room_id, message_dict):
    if room_id not in ROOMS: return
    for ws in list(ROOMS[room_id]['players'].keys()):
        try:
            # 개별 소켓에 따라 마스킹된 상태 전달
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

        if game_type == 'BINGO':
            size = int(data.get('size', 5))
            if size not in (3, 4, 5): size = 5
            max_lines = (size * 2) + 2
            target_lines = int(data.get('target_lines', size))
            if target_lines < 1 or target_lines > max_lines: target_lines = size

            topic = data.get('topic', '자유 주제').strip() or '자유 주제'
            game_mode = data.get('game_mode', 'WINNER')
            word_pool = data.get('word_pool', [])
            board = generate_player_board(word_pool, size)

            ROOMS[room_id] = {
                'game_type': 'BINGO',
                'status': 'WAITING',
                'turn_time_limit': TURN_DURATION_SECONDS,
                'config': {'size': size, 'target_lines': target_lines, 'topic': topic, 'game_mode': game_mode, 'word_pool': word_pool},
                'players': {
                    ws: {
                        'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': False,
                        'is_escaped': False, 'escape_rank': 0, 'is_loser': False, 'color': assigned_color,
                        'board': board, 'marked': set(), 'score': 0
                    }
                },
                'turn_order': [], 'current_turn_index': 0, 'turn_step': 0, 'called_items': [], 'chat_logs': []
            }
        else: # RUMMIKUB
            turn_time_limit = int(data.get('turn_time_limit', 60))
            deck = create_full_deck()
            ROOMS[room_id] = {
                'game_type': 'RUMMIKUB',
                'status': 'WAITING',
                'turn_time_limit': turn_time_limit,
                'deck': deck, 'table_sets': [],
                'players': {
                    ws: {
                        'id': current_player_id, 'nickname': nickname, 'is_host': True, 'is_ready': True,
                        'has_initial_meld': False, 'rack': [], 'color': assigned_color
                    }
                },
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
        used_colors = [p['color'] for p in room['players'].values()]
        assigned_color = get_unique_color(used_colors)

        if game_type == 'BINGO':
            board = generate_player_board(room['config']['word_pool'], room['config']['size'])
            room['players'][ws] = {
                'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False,
                'is_escaped': False, 'escape_rank': 0, 'is_loser': False, 'color': assigned_color,
                'board': board, 'marked': set(), 'score': 0
            }
        else:
            room['players'][ws] = {
                'id': current_player_id, 'nickname': nickname, 'is_host': False, 'is_ready': False,
                'has_initial_meld': False, 'rack': [], 'color': assigned_color
            }

        room['chat_logs'].append({'system': True, 'text': f"🎉 '{nickname}'님이 입장하셨습니다."})
        res = {'type': 'ROOM_JOINED', 'room_id': room_id, 'game_type': game_type, 'player_id': current_player_id, 'is_host': False, 'state': serialize_room_state(room_id, requester_ws=ws)}
        if hasattr(ws, 'send_json'): await ws.send_json(res)
        else: await ws.send(json.dumps(res, ensure_ascii=False))
        await broadcast_to_room(room_id, {'type': 'ROOM_UPDATED', 'state': None})
        return room_id

    elif msg_type == 'UPDATE_CONFIG':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players'] and room['players'][ws]['is_host'] and room['game_type'] == 'BINGO':
            size = int(data.get('size', room['config']['size']))
            max_lines = (size * 2) + 2
            target_lines = int(data.get('target_lines', room['config'].get('target_lines', size)))
            if target_lines < 1 or target_lines > max_lines: target_lines = size

            topic = str(data.get('topic', room['config']['topic'])).strip() or '자유 주제'
            word_pool = data.get('word_pool', room['config']['word_pool'])

            room['config']['size'] = size
            room['config']['target_lines'] = target_lines
            room['config']['topic'] = topic
            room['config']['word_pool'] = word_pool
            room['status'] = 'WAITING'
            room['called_items'] = []

            for p in room['players'].values():
                p['board'] = generate_player_board(word_pool, size)
                p['marked'] = set()
                p['score'] = 0
                p['is_ready'] = False

            room['chat_logs'].append({'system': True, 'text': f"⚙️ 방장이 주제를 [{topic}] (목표: {target_lines}줄) (으)로 변경하였습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'UPDATE_BOARD':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players'] and room['game_type'] == 'BINGO':
            p = room['players'][ws]
            p['board'] = data.get('board', p['board'])
            p['is_ready'] = False
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'UPDATE_CELL_TEXT':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players'] and room['game_type'] == 'BINGO':
            p = room['players'][ws]
            cell_index = data.get('cell_index')
            new_text = str(data.get('text', '')).strip()
            if cell_index is not None and 0 <= cell_index < len(p['board']):
                p['board'][cell_index] = new_text
                p['is_ready'] = False
                await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'RESET_GAME':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players'] and room['players'][ws]['is_host']:
            keep_board = data.get('keep_board', False)
            room['status'] = 'WAITING'
            room['called_items'] = []
            room['turn_order'] = []

            for p in room['players'].values():
                p['marked'] = set() if room['game_type'] == 'BINGO' else []
                p['score'] = 0
                p['is_ready'] = False
                p['is_escaped'] = False
                p['is_loser'] = False
                if room['game_type'] == 'BINGO' and not keep_board:
                    p['board'] = generate_player_board(room['config']['word_pool'], room['config']['size'])

            room['chat_logs'].append({'system': True, 'text': "🔄 방장이 대기실로 리셋했습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'TOGGLE_READY':
        room = ROOMS.get(current_room_id)
        if room and ws in room['players']:
            p = room['players'][ws]
            p['is_ready'] = not p.get('is_ready', False)
            status_str = "준비 완료" if p['is_ready'] else "준비 해제"
            room['chat_logs'].append({'system': True, 'text': f"✋ '{p['nickname']}'님이 {status_str}하셨습니다."})
            await broadcast_to_room(current_room_id, {'type': 'ROOM_UPDATED', 'state': None})

    elif msg_type == 'START_GAME':
        room = ROOMS.get(current_room_id)
        if not room or not room['players'][ws]['is_host']: return current_room_id
        
        unready = [p['nickname'] for p in room['players'].values() if not p['is_ready']]
        if unready:
            err = {'type': 'ERROR', 'message': f'준비하지 않은 플레이어가 있습니다: {", ".join(unready)}'}
            if hasattr(ws, 'send_json'): await ws.send_json(err)
            else: await ws.send(json.dumps(err, ensure_ascii=False))
            return current_room_id

        room['status'] = 'PLAYING'
        player_sockets = list(room['players'].keys())
        random.shuffle(player_sockets)
        room['turn_order'] = player_sockets
        room['current_turn_index'] = 0

        if room['game_type'] == 'BINGO':
            room['called_items'] = []
            for socket_key, p in room['players'].items():
                p['marked'] = set()
                p['score'] = 0
                p['is_escaped'] = False
                p['is_loser'] = False
        else:
            room['deck'] = create_full_deck()
            room['table_sets'] = []
            for socket_key, p in room['players'].items():
                p['rack'] = [room['deck'].pop() for _ in range(14)]
                p['has_initial_meld'] = False

        room['turn_start_time'] = time.time()

        turn_order_list = []
        for idx, socket_key in enumerate(player_sockets):
            p = room['players'][socket_key]
            turn_order_list.append({'rank': idx + 1, 'nickname': p['nickname'], 'color': p['color']})

        room['chat_logs'].append({'system': True, 'text': "🎲 턴 순서 제비뽑기가 완료되었습니다!"})
        await broadcast_to_room(current_room_id, {
            'type': 'STARTING_DRAW', 'turn_order_list': turn_order_list, 'state': None
        })

    elif msg_type == 'MARK_CELL': # BINGO ONLY
        room = ROOMS.get(current_room_id)
        if not room or room['status'] != 'PLAYING' or room['game_type'] != 'BINGO': return current_room_id
        cell_index = data.get('cell_index')
        player = room['players'][ws]
        word_text = player['board'][cell_index].strip()

        if word_text and word_text not in room['called_items']:
            room['called_items'].append(word_text)
            size = room['config']['size']
            target_lines = room['config'].get('target_lines', size)

            for p in room['players'].values():
                for idx, val in enumerate(p['board']):
                    if val.strip() == word_text: p['marked'].add(idx)
                p['score'] = calculate_bingo_lines(p['board'], p['marked'], size)

                # 승리 조건 달성 체크
                if p['score'] >= target_lines and not p['is_escaped']:
                    p['is_escaped'] = True
                    room['chat_logs'].append({'system': True, 'text': f"🏆 [{p['nickname']}]님이 {target_lines}줄을 완성하여 승리했습니다! 🎉"})

            room['chat_logs'].append({'system': True, 'text': f"📢 '{player['nickname']}'님이 [{word_text}]를 불렀습니다."})
            room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
            room['turn_start_time'] = time.time()

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