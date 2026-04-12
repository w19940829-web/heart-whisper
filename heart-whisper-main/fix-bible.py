import json

fixes = {
    6: "士師記",
    7: "路得記",
    10: "列王紀上",
    11: "列王紀下",
    14: "以斯拉記",
    16: "以斯帖記",
    17: "約伯記",
    25: "以西結書", # 25 should be Ezekiel (以西結書), currently mislabeled as 以斯拉記
    27: "何西阿書",
    65: "啟示錄"
}

with open("bible.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for idx, new_name in fixes.items():
    print(f"Fixing {idx}: {data[idx]['name']} -> {new_name}")
    data[idx]["name"] = new_name

with open("bible.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

print("Done fixing bible.json! Checking names again...")
for i, b in enumerate(data):
    if any(c.isascii() and c.isalpha() for c in b["name"]) or b["name"] == "以斯拉記":
        print(f"{i}: {b['name']}")
