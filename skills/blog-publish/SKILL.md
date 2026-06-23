---
name: blog-publish
description: 줄갭 사이트(jeong-korea·zulgap.kr·mamisa 등)에 블로그 글을 작성해 발행. "블로그 글 써줘", "OO 주제로 글 올려줘", "블로그 발행해줘", "홈페이지에 글 올려줘" 처럼 콘텐츠를 만들어 홈페이지에 올릴 때 사용.
---

# 블로그 발행 (줄갭 사이트)

직원이 **주제만** 주면, 사이트 블로그 형식대로 글을 작성하고 git push로 발행한다(→ 자동배포 → 홈페이지 반영). 직원은 git을 몰라도 된다.

## 사이트 → repo 매핑 (이 목록의 블로그 사이트만 작업)
| 사이트 | repo |
|---|---|
| jeong-korea | `zulgap/jeong-korea` |
| zulgap.kr | `zulgap/zulgap-website` |
| mamisa | `zulgap/mamisa-market-research` |
| (judgmentos.zulgap.kr) | 위치 확인 후 추가 예정 |

> 🚨 **위 블로그 repo만 건드린다.** judgmentos(production)·서버·DB·다른 repo는 **절대 건드리지 않는다.** 직원은 콘텐츠 발행자이지 코드/서버 관리자가 아니다.

## 실행 순서

1. **사이트 + 주제 확정** — "어느 사이트에, 무슨 주제로 쓸까요?" 직원에게 물어 확정.

2. **repo 준비** — 해당 repo가 로컬에 없으면 `gh repo clone zulgap/<repo>`, 있으면 `git -C <폴더> pull`.

3. **블로그 형식 파악 (추측 금지)** — 그 repo의 `content/blog/_TEMPLATE.md`(있으면)와 **기존 글 1개를 Read**해서 형식을 그대로 따른다:
   - 폴더 위치 (`content/blog/`), 파일명 규칙(`NN-slug.mdx`)
   - frontmatter 필드 (title·date·excerpt·seoKeywords·faq 등)
   - 본문 구조 (사이트마다 다를 수 있음 — 반드시 그 repo 것 확인)

4. **글 작성** — 위 형식대로 `content/blog/<순번>-<slug>.mdx` 생성. 광고슬롯·JSON-LD 등 "사이트가 자동 주입"이라 표시된 건 본문에 직접 쓰지 않는다.

5. **발행 확인 → push** — 직원에게 글 미리보기 + "이 내용으로 올릴까요?" 확인. OK면:
   ```
   git -C <폴더> add content/blog/<파일>
   git -C <폴더> -c user.email="zulgap0327@gmail.com" commit -m "blog: <제목>"
   git -C <폴더> push
   ```
   → Vercel/Railway 자동배포.

6. **결과 안내** — "올렸습니다. 몇 분 후 <사이트 URL>/blog 에 반영됩니다."

## 주의 (직원 안전)
- **블로그 repo만** — production·서버·DB·다른 repo 금지.
- 글 형식은 **각 사이트의 _TEMPLATE.md/기존 글을 Read**해서 따른다 (사이트마다 다름).
- `git config user.email = zulgap0327@gmail.com` (Vercel Hobby 배포 차단 방지).
- 이미지가 필요하면 `public/images/blog/`에 넣고 상대경로로 참조.
- push 권한이 없다는 에러가 나면 = 사장님께 "이 repo에 초대해주세요" 요청 (각 사이트 repo collaborator 필요).
