import sqlite3, json, sys

DB = r"C:\Users\himan\.local\share\mimocode\mimocode.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
c = conn.cursor()

cmd = sys.argv[1] if len(sys.argv) > 1 else "tables"

if cmd == "tables":
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    for r in c.fetchall():
        print(r[0])

elif cmd == "sessions":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c.execute("SELECT id, directory, title, time_created FROM session WHERE time_created > ? ORDER BY time_created DESC", (cutoff_ms,))
    for r in c.fetchall():
        print(json.dumps({"id": r[0], "dir": r[1], "title": r[2], "ts": r[3]}, ensure_ascii=False))

elif cmd == "tool_usage":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c.execute("""
        SELECT json_extract(p.data, '$.tool') as tool,
               substr(json_extract(p.data, '$.state.input'), 1, 200) as input_preview,
               count(*) as n
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND m.time_created > ?
        GROUP BY tool, input_preview
        ORDER BY n DESC
        LIMIT 50
    """, (cutoff_ms,))
    for r in c.fetchall():
        print(json.dumps({"tool": r[0], "input": r[1], "count": r[2]}, ensure_ascii=False))

elif cmd == "user_keywords":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    keyword = sys.argv[3] if len(sys.argv) > 3 else "repeat"
    c.execute("""
        SELECT m.session_id, substr(json_extract(m.data, '$.content'), 1, 500) as content
        FROM message m
        WHERE json_extract(m.data, '$.role') = 'user'
          AND m.time_created > ?
          AND json_extract(m.data, '$.content') LIKE ?
        LIMIT 20
    """, (cutoff_ms, f"%{keyword}%"))
    for r in c.fetchall():
        print(json.dumps({"session": r[0], "content": r[1]}, ensure_ascii=False))

elif cmd == "schema":
    c.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
    for r in c.fetchall():
        print(f"\n--- {r[0]} ---")
        print(r[1])

elif cmd == "message_count":
    c.execute("SELECT count(*) FROM message")
    print(c.fetchone()[0])

elif cmd == "recent_msgs":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c.execute("""
        SELECT m.id, m.session_id, json_extract(m.data, '$.role') as role,
               substr(json_extract(m.data, '$.content'), 1, 300) as content_preview,
               m.time_created
        FROM message m
        WHERE m.time_created > ?
        ORDER BY m.time_created DESC
        LIMIT 30
    """, (cutoff_ms,))
    for r in c.fetchall():
        print(json.dumps({"id": r[0], "session": r[1], "role": r[2], "preview": r[3], "ts": r[4]}, ensure_ascii=False))

elif cmd == "repeated_file_access":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c.execute("""
        SELECT json_extract(p.data, '$.tool') as tool,
               json_extract(p.data, '$.state.input') as full_input,
               m.session_id,
               count(*) as n
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND json_extract(p.data, '$.tool') IN ('read', 'edit', 'write', 'grep', 'glob')
          AND m.time_created > ?
        GROUP BY tool, full_input, m.session_id
        HAVING n > 1
        ORDER BY n DESC
        LIMIT 30
    """, (cutoff_ms,))
    for r in c.fetchall():
        print(json.dumps({"tool": r[0], "input": r[1][:300] if r[1] else "", "session": r[2], "count": r[3]}, ensure_ascii=False))

elif cmd == "file_patterns":
    cutoff_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c.execute("""
        SELECT json_extract(p.data, '$.state.input') as full_input,
               json_extract(p.data, '$.tool') as tool,
               count(distinct m.session_id) as session_count,
               count(*) as total_count
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND json_extract(p.data, '$.tool') IN ('read', 'edit', 'write', 'grep', 'glob')
          AND m.time_created > ?
        GROUP BY full_input, tool
        HAVING session_count > 1
        ORDER BY total_count DESC
        LIMIT 40
    """, (cutoff_ms,))
    for r in c.fetchall():
        inp = r[0][:400] if r[0] else ""
        print(json.dumps({"input": inp, "tool": r[1], "sessions": r[2], "total": r[3]}, ensure_ascii=False))

conn.close()
