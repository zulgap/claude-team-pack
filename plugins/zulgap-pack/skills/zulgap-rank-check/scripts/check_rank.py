#!/usr/bin/env python3
"""
네이버 블로그 검색결과 노출순위 체크
- 지정한 키워드로 네이버 검색을 실제로 실행하고, 특정 블로그 포스트가 몇 번째에 뜨는지 센다.
- Playwright/브라우저 없이 순수 HTTP 요청 + HTML 파싱만 사용 (curl로 직접 접근 가능함을 확인함).

사용법:
  python check_rank.py --url "https://blog.naver.com/abc123/223456789" --keyword "검단가온치과 임플란트"

옵션:
  --tab blog|view   (기본 blog: 블로그탭 단일 순위 / view: 통합검색 VIEW탭 내 블로그결과 순위, 근사치)
  --max-page N      (기본 5 → 블로그탭 기준 최대 50위까지 탐색)
"""
import argparse
import re
import sys
import time
import urllib.parse

import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# blog.naver.com/{blogId}/{logNo} 또는 blog.naver.com/PostView.naver?blogId=X&logNo=Y 둘 다 처리
LINK_PATTERN = re.compile(
    r"blog\.naver\.com/(?:PostView\.naver\?[^\"'<> ]*?blogId=([\w\-\.]+)[^\"'<> ]*?logNo=(\d+)"
    r"|([\w\-\.]+)/(\d+))",
    re.IGNORECASE,
)


def normalize_target(url: str):
    """대상 URL에서 (blogId, logNo)를 뽑아낸다."""
    m = re.search(r"blog\.naver\.com/(?:PostView\.naver\?)?", url)
    if not m:
        raise ValueError(f"네이버 블로그 URL이 아닙니다: {url}")
    qs_blog_id = re.search(r"[?&]blogId=([\w\-\.]+)", url)
    qs_log_no = re.search(r"[?&]logNo=(\d+)", url)
    if qs_blog_id and qs_log_no:
        return qs_blog_id.group(1), qs_log_no.group(1)
    path_m = re.search(r"blog\.naver\.com/([\w\-\.]+)/(\d+)", url)
    if path_m:
        return path_m.group(1), path_m.group(2)
    raise ValueError(f"URL에서 blogId/logNo를 추출하지 못했습니다: {url}")


def extract_ordered_hits(html: str):
    """검색결과 HTML에서 등장 순서대로 (blogId, logNo) 리스트를 뽑는다. 같은 글의 중복 링크는 첫 등장만 남긴다."""
    hits = []
    seen = set()
    for m in LINK_PATTERN.finditer(html):
        if m.group(1) and m.group(2):
            blog_id, log_no = m.group(1), m.group(2)
        else:
            blog_id, log_no = m.group(3), m.group(4)
        key = (blog_id, log_no)
        if key in seen:
            continue
        seen.add(key)
        hits.append(key)
    return hits


def fetch_page(keyword: str, tab: str, start: int) -> str:
    where = "view" if tab == "view" else "blog"
    params = {"where": where, "query": keyword}
    if start > 1:
        params["start"] = start
    url = "https://search.naver.com/search.naver?" + urllib.parse.urlencode(params)
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=15)
    resp.raise_for_status()
    return resp.text


def check_rank(keyword: str, target_url: str, tab: str = "blog", max_page: int = 5):
    target = normalize_target(target_url)
    overall_rank = 0
    for page in range(max_page):
        start = 1 + page * 10
        html = fetch_page(keyword, tab, start)
        hits = extract_ordered_hits(html)
        if not hits:
            break
        for hit in hits:
            overall_rank += 1
            if hit == target:
                return {
                    "found": True,
                    "rank": overall_rank,
                    "page": page + 1,
                    "tab": tab,
                    "keyword": keyword,
                }
        time.sleep(1)  # 과도한 연속 요청 방지
    return {
        "found": False,
        "rank": None,
        "checked_up_to": overall_rank,
        "tab": tab,
        "keyword": keyword,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="순위를 확인할 네이버 블로그 포스트 URL")
    ap.add_argument("--keyword", required=True, help="검색할 키워드")
    ap.add_argument("--tab", choices=["blog", "view"], default="blog")
    ap.add_argument("--max-page", type=int, default=5)
    args = ap.parse_args()

    try:
        result = check_rank(args.keyword, args.url, args.tab, args.max_page)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if result["found"]:
        print(f"[{result['tab']}] '{result['keyword']}' → {result['rank']}위 ({result['page']}페이지)")
    elif result["checked_up_to"] == 0:
        print(f"[{result['tab']}] '{result['keyword']}' → 검색결과 없음")
    else:
        print(f"[{result['tab']}] '{result['keyword']}' → {result['checked_up_to']}위 밖 (미노출 또는 순위권 밖)")


if __name__ == "__main__":
    main()
