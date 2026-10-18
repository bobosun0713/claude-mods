"""以 Claude 官方價格頁更新內建價格表 scripts/prices.json。

用法：
  python3 update_prices.py [--source <價格頁 Markdown 檔>] [--summary <輸出 Markdown 檔>]

  --source   改讀本機的價格頁 Markdown（測試用）；省略時從官方文件下載
  --summary  將價格變動摘要寫入檔案（供 PR 內文使用）

模型列表以官方價格頁為準：新增、調整與官方已移除的模型都會反映在價格表中。
價格無變動時不改寫檔案。價格頁無法解析時以結束代碼 1 結束，不改寫檔案。
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# python3 -I 不會把腳本目錄放進 sys.path，手動加入以共用 scan.py 的轉換邏輯
sys.path.insert(0, HERE)

from scan import ONLINE_URL, fetch_page, from_official  # noqa: E402

PRICES = os.path.join(HERE, "prices.json")
FIELDS = ("input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h", "fastInput", "fastOutput", "above100k")


def load_page(source):
    if source:
        with open(source, encoding="utf-8") as handle:
            return handle.read()
    return fetch_page(timeout=30)


def render(data):
    """每個模型一行，讓 diff 只顯示有變動的模型"""
    lines = ["{"]
    lines.append(f'  "_comment": {json.dumps(data["_comment"], ensure_ascii=False)},')
    lines.append('  "models": {')
    names = sorted(data["models"])
    for index, name in enumerate(names):
        comma = "," if index < len(names) - 1 else ""
        lines.append(f"    {json.dumps(name)}: {json.dumps(data['models'][name])}{comma}")
    lines += ["  }", "}", ""]
    return "\n".join(lines)


def text(value):
    if isinstance(value, dict):
        return "{" + ", ".join(f"{key} {value[key]}" for key in FIELDS if key in value) + "}"
    return "—" if value is None else str(value)


def describe(name, old, new):
    if old is None:
        return f"| `{name}` | 新增 | {text(new)} |"
    if new is None:
        return f"| `{name}` | 移除 | {text(old)} |"
    changes = [f"{key} {text(old.get(key))} → {text(new.get(key))}" for key in FIELDS if old.get(key) != new.get(key)]
    return f"| `{name}` | 調整 | " + ", ".join(changes) + " |" if changes else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--summary")
    args = parser.parse_args()

    with open(PRICES, encoding="utf-8") as handle:
        current = json.load(handle)

    try:
        latest = from_official(load_page(args.source))
    except (OSError, ValueError) as error:  # 連線失敗或頁面格式異常
        print(f"價格頁無法解析：{error}", file=sys.stderr)
        sys.exit(1)

    old = current["models"]
    rows = [
        row
        for name in sorted(set(old) | set(latest))
        if (row := describe(name, old.get(name), latest.get(name)))
    ]
    models = latest

    if not rows:
        print("價格沒有變動。")
        return

    with open(PRICES, "w", encoding="utf-8") as handle:
        handle.write(render({"_comment": current["_comment"], "models": models}))

    summary = "\n".join(
        [
            f"依 [Claude 官方價格頁]({ONLINE_URL}) 更新 `skill-cost/scripts/prices.json`（美元 / 百萬 token）。",
            "",
            "| 模型 | 類型 | 變動 |",
            "| --- | --- | --- |",
            *rows,
            "",
        ]
    )
    print(summary)
    if args.summary:
        with open(args.summary, "w", encoding="utf-8") as handle:
            handle.write(summary)


if __name__ == "__main__":
    main()
