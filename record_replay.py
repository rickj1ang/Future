#!/usr/bin/env python3
"""
录制 Future Agent 演示回放数据。

连续向后端发送 4 个场景的真实请求，记录每个事件的相对时间戳，
生成 replay.json 供前端回放使用。

用法：
  python3 record_replay.py <backend_url>

例如：
  python3 record_replay.py http://152.32.202.56
"""

import json
import sys
import time
import urllib.request
from datetime import datetime


# 4 个演示场景，覆盖 Agent 全部能力
SCENES = [
    {"prompt": "看看茅台最近的走势", "label": "行情"},
    {"prompt": "帮我买入100股贵州茅台", "label": "下单"},
    {"prompt": "我有哪些订单？", "label": "查单"},
    {"prompt": "撤销最新的那个买单", "label": "撤单"},
]


def parse_sse_stream(resp, t0):
    """解析 SSE 流，返回 [{t, event, data}]"""
    events = []
    buffer = ""
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            ev = parse_block(block)
            if ev:
                ev["t"] = round((time.time() - t0) * 1000)  # 毫秒
                events.append(ev)
    return events


def parse_block(block):
    """解析单个 SSE block"""
    event = "message"
    data_lines = []
    for line in block.split("\n"):
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if not data_lines:
        return None
    try:
        data = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None
    return {"event": event, "data": data}


def record_scene(backend, prompt, label):
    """录制单个场景，返回 {prompt, label, events}"""
    print(f"\n▶ 录制 [{label}] : {prompt}", flush=True)
    body = json.dumps({"messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(
        f"{backend}/chat",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        events = parse_sse_stream(resp, t0)
    except Exception as e:
        print(f"  ❌ 失败: {e}", flush=True)
        return None

    kinds = {}
    for e in events:
        kinds[e["event"]] = kinds.get(e["event"], 0) + 1
    duration = events[-1]["t"] if events else 0
    print(f"  ✅ {len(events)} 个事件, {duration}ms, 类型: {kinds}", flush=True)
    return {
        "prompt": prompt,
        "label": label,
        "events": [
            {"t": e["t"], "event": e["event"], "data": e["data"]} for e in events
        ],
    }


def main():
    backend = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8081"
    print(f"后端: {backend}")
    print(f"场景: {len(SCENES)} 个")

    scenes = []
    for s in SCENES:
        result = record_scene(backend, s["prompt"], s["label"])
        if result:
            scenes.append(result)
        time.sleep(1)

    output = {
        "version": 1,
        "recorded_at": datetime.now().isoformat(),
        "backend": backend,
        "scenes": scenes,
    }

    outfile = "replay.json"
    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    size_kb = len(json.dumps(output, ensure_ascii=False)) / 1024
    print(f"\n✅ 已生成 {outfile} ({size_kb:.1f} KB, {len(scenes)}/{len(SCENES)} 场景)")


if __name__ == "__main__":
    main()
