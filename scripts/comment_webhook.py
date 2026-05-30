#!/usr/bin/env python3
"""
PROJECT COLISEUM — Comment Notification Webhook
Local HTTP server that receives comment notifications from the browser
and writes them to a queue file for Hermes cron to pick up.

Usage:
  python comment_webhook.py [--port 18521]

Runs until Ctrl+C. Designed to run as a Hermes background process.
"""

import json
import os
import sys
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# ── Config ──
DEFAULT_PORT = 18521
NOTIFY_DIR = os.path.expanduser(
    '~/AppData/Local/hermes/cron/output/comment_notifications'
)

def ensure_dir():
    os.makedirs(NOTIFY_DIR, exist_ok=True)

def write_notification(data):
    """Write one notification as a JSON line to a date-stamped file."""
    ensure_dir()
    today = datetime.now().strftime('%Y-%m-%d')
    filepath = os.path.join(NOTIFY_DIR, f'{today}.jsonl')
    data['_received_at'] = time.time()
    data['_delivered'] = False
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False) + '\n')
    return filepath


class CommentHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler that accepts POST with comment JSON."""

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {'error': 'invalid JSON'})
            return

        name = data.get('name', '匿名')
        message = data.get('message', '')
        page = data.get('page', 'Project Colosseum')

        if not message:
            self._respond(400, {'error': 'message required'})
            return

        # Validate required fields
        entry = {
            'id': str(uuid.uuid4())[:8],
            'name': name[:30],
            'message': message[:500],
            'timestamp': data.get('timestamp', int(time.time() * 1000)),
            'page': page,
        }

        filepath = write_notification(entry)
        print(f'[webhook] Comment from "{name}": {message[:50]}... → {filepath}')

        self._respond(200, {'ok': True, 'id': entry['id']})

    def do_OPTIONS(self):
        """CORS preflight."""
        self._respond(204, None)

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        if data is not None:
            self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, format, *args):
        """Suppress default HTTP log noise; only our custom prints show."""
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    server = HTTPServer(('127.0.0.1', port), CommentHandler)
    print(f'[webhook] Comment notification server running on http://127.0.0.1:{port}')
    print(f'[webhook] Notifications written to: {NOTIFY_DIR}')
    print(f'[webhook] Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[webhook] Shutting down.')
        server.server_close()


if __name__ == '__main__':
    main()
