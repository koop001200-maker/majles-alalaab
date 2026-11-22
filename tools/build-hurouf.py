#!/usr/bin/env python3
"""يبني data/hurouf-questions.json و js/hurouf-data.js من data/hurouf-source.txt
ويتحقق: كل إجابة تبدأ بحرفها (بعد حذف «ال» وتوحيد الهمزات)، وكل حرف فيه 20 سؤالاً على الأقل، وبدون تكرار.
الاستخدام:  python3 tools/build-hurouf.py"""
import json, re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
LETTERS = list("ابتثجحخدذرزسشصضطظعغفقكلمنهوي")
CATS = {"gen": "عامة", "his": "تاريخ", "geo": "جغرافيا", "sci": "علوم", "spo": "رياضة", "cul": "ثقافة وتراث", "rel": "دين", "lit": "لغة وأدب", "ksa": "السعودية"}

def norm(s):
    s = re.sub(r"[ً-ْـ]", "", s)          # تشكيل وتطويل
    s = re.sub(r"[أإآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", s).strip()

def first_letters(ans):
    t = norm(ans)
    out = {t[0]} if t else set()
    u = re.sub(r"^(ال)(?=\S)", "", t)                    # حذف «ال» من أول الإجابة (وتقبل الحالتان لمثل «ألعاب»)
    if u: out.add(u[0])
    return out

data, errs, seen = collections.OrderedDict(), [], set()
cur = None
for n, line in enumerate((ROOT / "data/hurouf-source.txt").read_text(encoding="utf-8").splitlines(), 1):
    line = line.rstrip()
    if not line or line.startswith("#") and not line.startswith("##"):
        continue
    if line.startswith("## "):
        cur = line[3:].strip(); data[cur] = []; continue
    p = line.split("|")
    if len(p) < 4: errs.append(f"سطر {n}: صيغة ناقصة"); continue
    lvl, cat, q, a = p[0], p[1], p[2].strip(), p[3].strip()
    alts = [x.strip() for x in (p[4].split(";") if len(p) > 4 else []) if x.strip()]
    if lvl not in ("1", "2"): errs.append(f"سطر {n}: مستوى غير صحيح")
    if cat not in CATS: errs.append(f"سطر {n}: تصنيف غير معروف {cat}")
    L = norm(cur) if cur else ""
    if norm(cur) not in first_letters(a): errs.append(f"سطر {n}: الإجابة «{a}» لا تبدأ بحرف «{cur}»")
    if q in seen: errs.append(f"سطر {n}: سؤال مكرر")
    seen.add(q)
    data[cur].append({"id": f"{LETTERS.index(cur)+1:02d}{len(data[cur])+1:02d}", "l": int(lvl), "c": cat, "q": q, "a": a, "alt": alts})

for L in LETTERS:
    k = len(data.get(L, []))
    if k < 20: errs.append(f"حرف {L}: {k} سؤالاً فقط (المطلوب 20)")
if errs:
    print("\n".join(errs)); sys.exit(1)

out = {"letters": LETTERS, "cats": CATS, "questions": data}
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data/hurouf-questions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
(ROOT / "js/hurouf-data.js").write_text("/* مولَّد من data/hurouf-source.txt بواسطة tools/build-hurouf.py — لا تعدّله يدوياً. */\nwindow.HU_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
tot = sum(len(v) for v in data.values())
print(f"تم: {tot} سؤالاً في {len(data)} حرفاً — الأقل {min(len(v) for v in data.values())}، الأكثر {max(len(v) for v in data.values())}")
