#!/usr/bin/env python3
"""
PROJECT COLISEUM — Comment Notification Checker
Reads undelivered comment notifications and outputs them for Hermes cron delivery.

Designed to run as a cron job script (no_agent=False).
Outputs formatted JSON lines of undelivered comments, then marks them delivered.
"""

import json
import os
import glob
from datetime import datetime

NOTIFY_DIR = os.path.expanduser(
    '~/AppData/Local/hermes/cron/output/comment_notifications'
)


def get_undelivered():
    """Read all JSONL files and yield undelivered entries."""
    today = datetime.now().strftime('%Y-%m-%d')
    pattern = os.path.join(NOTIFY_DIR, '*.jsonl')
    for filepath in sorted(glob.glob(pattern)):
        filename = os.path.basename(filepath)
        remaining = []
        modified = False
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get('_delivered', False):
                    remaining.append(entry)
                else:
                    modified = True
                    yield entry

        if modified:
            # Re-write remaining (marked as delivered) back to file
            with open(filepath, 'w', encoding='utf-8') as f:
                for entry in remaining:
                    f.write(json.dumps(entry, ensure_ascii=False) + '\n')


def main():
    count = 0
    for entry in get_undelivered():
        count += 1
        name = entry.get('name', '匿名')
        message = entry.get('message', '')
        ts = entry.get('timestamp', 0)
        time_str = datetime.fromtimestamp(ts / 1000).strftime('%m-%d %H:%M') if ts else '--'
        print(f'💬 {name} @ {time_str}')
        print(f'{message}')
        print('---')

    if count == 0:
        # No new comments — output nothing (cron stays silent)
        pass


if __name__ == '__main__':
    main()
