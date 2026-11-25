#!/usr/bin/env python3
"""«سين جيم»: يقرأ data/seenjeem-source.txt ويتحقق منه ثم يكتب js/seenjeem-data.js.
السطر: الفئة|القيمة|السؤال|الجواب  — القيم 200/400/600، وكل فئة تحتاج سؤالين على الأقل من كل قيمة."""
import json, re, sys, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATS = [
    ("gen", "معلومات عامة", "💡"), ("ksa", "المملكة العربية السعودية", "🇸🇦"), ("hist", "التاريخ والحضارات", "🏛️"),
    ("geo", "الجغرافيا والدول والعواصم", "🌍"), ("sci", "العلوم والاكتشافات", "🔬"), ("sport", "الرياضة وكرة القدم", "⚽"),
    ("islam", "الثقافة الإسلامية والصحابة", "🕌"), ("quran", "القرآن الكريم والسيرة النبوية", "📖"), ("film", "الأفلام والمسلسلات", "🎬"),
    ("anime", "الأنمي والرسوم المتحركة", "🎌"), ("tech", "التكنولوجيا والاختراعات", "💻"), ("food", "الطعام والمطبخ", "🍽️"),
    ("animal", "الحيوانات والطبيعة", "🦁"), ("famous", "الشخصيات المشهورة", "⭐"), ("riddle", "الألغاز والذكاء", "🧩"),
    ("folk", "الثقافة الشعبية والأمثال", "🐪"), ("cars", "السيارات", "🚗"), ("space", "الفضاء والفلك", "🚀"),
    ("ramadan", "رمضان والعيد", "🌙"), ("watani", "اليوم الوطني والتأسيس", "💚"),
    ("kids", "قناة بسمة (كرتون الأطفال)", "🎈"),
]
ids = {c[0] for c in CATS}
qs, seen, per = [], set(), {}
for n, line in enumerate(open(os.path.join(root, "data/seenjeem-source.txt"), encoding="utf-8"), 1):
    line = line.strip()
    if not line or line.startswith("#"): continue
    p = line.split("|")
    if len(p) != 4: sys.exit("سطر %d: لازم 4 حقول" % n)
    c, v, q, a = [x.strip() for x in p]
    if c not in ids: sys.exit("سطر %d: فئة مجهولة %s" % (n, c))
    if v not in ("200", "400", "600"): sys.exit("سطر %d: قيمة غير صحيحة" % n)
    if not q or not a: sys.exit("سطر %d: سؤال أو جواب فارغ" % n)
    if q in seen: sys.exit("سطر %d: سؤال مكرر" % n)
    seen.add(q); k = (c, int(v)); per[k] = per.get(k, 0) + 1
    qs.append({"id": "%s-%s-%d" % (c, v, per[k]), "c": c, "p": int(v), "q": q, "a": a})
bad = [(c, v) for c in ids for v in (200, 400, 600) if per.get((c, v), 0) < 2]
if bad: sys.exit("ينقص أسئلة: %s" % bad)
data = {"cats": [{"id": i, "name": n, "icon": e} for i, n, e in CATS], "questions": qs}
open(os.path.join(root, "js/seenjeem-data.js"), "w", encoding="utf-8").write("window.SJ_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("ok:", len(qs), "سؤال،", len(CATS), "فئة")
