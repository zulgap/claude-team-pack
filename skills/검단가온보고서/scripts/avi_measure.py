# -*- coding: utf-8 -*-
"""
AVI v3 측정 (검단가온치과) — 노출률/Top3/SOV, Perplexity Sonar + Gemini 2.5 Flash
2026-06-04 baseline 스크립트 재구성 (정의 동일: 질문 10개 x N회 반복, 표준 라이브러리만).
사용: python avi_measure_v3.py --engine both --runs 30
키: env PERPLEXITY_API_KEY / GEMINI_API_KEY (railway run으로 주입)
"""
import argparse, json, os, re, sys, time, threading, queue
import urllib.request, urllib.error
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

QUESTIONS = {
    "Q1": "검단에서 치과 추천 3개만 알려주세요.",
    "Q2": "검단에서 임플란트 잘하는 치과 추천해주세요.",
    "Q3": "검단에서 신경치료 잘하는 치과 어디인가요?",
    "Q4": "검단에서 러버댐 쓰는 치과 알려주세요.",
    "Q5": "검단에서 PDRN 재생주사 가능한 치과 있나요?",
    "Q6": "검단에서 DSLR 사진으로 치아 상태 설명해주는 치과 있나요?",
    "Q7": "검단에서 더블보드 전문의가 있는 치과 알려주세요.",
    "Q8": "검단에서 임플란트 후 회복 빠른 치과 추천해주세요.",
    "Q9": "검단에서 치경부 마모증 치료 잘하는 치과 알려주세요.",
    "Q10": "검단에서 치아교정 잘하는 치과 추천해주세요.",
}

CLIENT_PATTERNS = ["검단가온", "가온치과", "가온 치과"]
# 경쟁사 사전 (v3 baseline 문서 §D + 원시로그 등장 치과)
COMPETITORS = {
    "검단퍼스트": ["검단퍼스트"],
    "연세검단": ["연세검단", "연세 검단"],
    "스마일365": ["스마일365", "스마일 365"],
    "예온": ["예온치과", "예온 치과"],
    "플란": ["플란치과", "플란 치과"],
    "센트럴": ["센트럴치과", "검단센트럴", "센트럴 치과"],
    "치과로와": ["치과로와", "로와치과"],
    "검단중앙": ["검단중앙"],
    "검단브라이트": ["검단브라이트", "브라이트치과"],
    "우수치과": ["우수치과"],
}

def find_clinics_in_order(text):
    """응답에서 치과(고객+경쟁사) 첫 등장 순서 리스트 반환"""
    hits = []
    for pat in CLIENT_PATTERNS:
        idx = text.find(pat)
        if idx >= 0:
            hits.append((idx, "_CLIENT_"))
            break
    for name, pats in COMPETITORS.items():
        best = -1
        for p in pats:
            i = text.find(p)
            if i >= 0 and (best < 0 or i < best):
                best = i
        if best >= 0:
            hits.append((best, name))
    hits.sort()
    return [h[1] for h in hits]

def http_json(url, headers, body, timeout=90):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def query_pplx(question):
    key = os.environ["PERPLEXITY_API_KEY"]
    body = {
        "model": "sonar",
        "messages": [{"role": "user", "content": question}],
        "temperature": 0.7,
    }
    resp = http_json("https://api.perplexity.ai/chat/completions",
                     {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, body)
    return resp["choices"][0]["message"]["content"]

def query_gemini(question):
    key = os.environ["GEMINI_API_KEY"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    body = {
        "contents": [{"parts": [{"text": question}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.7},
    }
    try:
        resp = http_json(url, {"Content-Type": "application/json"}, body)
    except urllib.error.HTTPError as e:
        if e.code in (400, 403, 429):
            body.pop("tools", None)  # grounding 불가 시 폴백
            resp = http_json(url, {"Content-Type": "application/json"}, body)
        else:
            raise
    parts = resp.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)

ENGINES = {"Perplexity": query_pplx, "Gemini": query_gemini}

def worker(engine, fn, q, results, raw_f, lock):
    while True:
        try:
            qid, run = q.get_nowait()
        except queue.Empty:
            return
        question = QUESTIONS[qid]
        text, err = "", None
        for attempt in range(3):
            try:
                text = fn(question)
                break
            except Exception as e:
                err = str(e)[:200]
                time.sleep(3 * (attempt + 1))
        order = find_clinics_in_order(text) if text else []
        present = "_CLIENT_" in order
        rank = order.index("_CLIENT_") + 1 if present else None
        rec = {"engine": engine, "qid": qid, "run": run, "present": present,
               "rank": rank, "clinics": [c for c in order if c != "_CLIENT_"],
               "error": err if not text else None, "excerpt": text[:500]}
        with lock:
            raw_f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            raw_f.flush()
            results.append(rec)
            done = len(results)
            if done % 20 == 0:
                print(f"[{engine}] progress {done} calls done", flush=True)
        q.task_done()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="both", choices=["pplx", "gemini", "both"])
    ap.add_argument("--runs", type=int, default=30)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    engines = []
    if args.engine in ("pplx", "both"): engines.append("Perplexity")
    if args.engine in ("gemini", "both"): engines.append("Gemini")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    raw_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"avi_raw_{ts}.jsonl")
    sum_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"avi_summary_{ts}.json")
    print(f"raw -> {raw_path}", flush=True)

    all_results = {}
    with open(raw_path, "w", encoding="utf-8") as raw_f:
        lock = threading.Lock()
        for engine in engines:
            fn = ENGINES[engine]
            q = queue.Queue()
            for qid in QUESTIONS:
                for run in range(1, args.runs + 1):
                    q.put((qid, run))
            results = []
            threads = [threading.Thread(target=worker, args=(engine, fn, q, results, raw_f, lock), daemon=True)
                       for _ in range(args.workers)]
            t0 = time.time()
            for t in threads: t.start()
            for t in threads: t.join()
            all_results[engine] = results
            print(f"[{engine}] finished {len(results)} calls in {time.time()-t0:.0f}s", flush=True)

    # 집계
    summary = {}
    for engine, results in all_results.items():
        per_q = {}
        for qid in QUESTIONS:
            rs = [r for r in results if r["qid"] == qid]
            n = len(rs)
            ok = [r for r in rs if not r["error"]]
            present = [r for r in ok if r["present"]]
            top3 = [r for r in present if r["rank"] and r["rank"] <= 3]
            client_mentions = len(present)
            comp_counts = {}
            total_comp = 0
            for r in ok:
                for c in r["clinics"]:
                    comp_counts[c] = comp_counts.get(c, 0) + 1
                    total_comp += 1
            sov = client_mentions / (client_mentions + total_comp) * 100 if (client_mentions + total_comp) else 0.0
            top_comp = sorted(comp_counts.items(), key=lambda x: -x[1])[:3]
            per_q[qid] = {
                "n": n, "errors": n - len(ok),
                "exposure": round(len(present) / len(ok) * 100, 1) if ok else 0.0,
                "top3": round(len(top3) / len(ok) * 100, 1) if ok else 0.0,
                "sov": round(sov, 1),
                "top_competitors": [f"{k}{v}" for k, v in top_comp],
            }
        avg = lambda k: round(sum(per_q[q][k] for q in QUESTIONS) / len(QUESTIONS), 1)
        summary[engine] = {"per_question": per_q,
                           "avg_exposure": avg("exposure"), "avg_top3": avg("top3"), "avg_sov": avg("sov")}

    with open(sum_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n===== SUMMARY =====")
    for engine, s in summary.items():
        print(f"\n## {engine}: 평균 노출률 {s['avg_exposure']}% / Top3 {s['avg_top3']}% / SOV {s['avg_sov']}%")
        for qid in QUESTIONS:
            p = s["per_question"][qid]
            print(f"  {qid}: 노출 {p['exposure']}% / Top3 {p['top3']}% / SOV {p['sov']}% / 경쟁 {','.join(p['top_competitors'])} (err {p['errors']})")
    print(f"\nsummary -> {sum_path}")

if __name__ == "__main__":
    main()
