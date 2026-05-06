---
description: 오늘 작업을 journal.md에 정리하고 CLAUDE.md를 갱신한 뒤 커밋·푸시
---

# /wrap-up

오늘 세션의 작업을 journal.md에 추가하고 CLAUDE.md "최근 변경" 섹션을 갱신한 뒤,
사용자 확인을 거쳐 git에 기록합니다.

---

## 1. 오늘 KST 날짜 확인

- 시스템 프롬프트의 `currentDate`를 우선 사용
- 없거나 불확실하면 `TZ=Asia/Seoul date +%Y-%m-%d` 실행
- 형식: `YYYY-MM-DD`

## 2. 오늘의 작업 내용 식별

- 현재 대화 내역에서 사용자가 요청한 작업·코드 변경·의사결정 추출
- 보조 자료로 `git log --since="<오늘 00:00 KST>" --pretty=format:"%h %s"` 호출
- 한 줄짜리 fix·typo 같은 것은 묶어서 1줄로 압축

## 3. journal.md에 새 섹션 추가

파일 위치: 프로젝트 루트 `journal.md`

규칙:
- 파일 최상단의 헤더·기간 표시는 건드리지 않는다
- 마지막 날짜 섹션 **다음** 위치에 새 섹션 삽입
- 같은 날짜 섹션이 이미 있으면 **새로 만들지 않고 기존 섹션의 각 카테고리에 항목을 보강**
- 항목이 정말 없으면 `- 없음`으로 한 줄 채움
- 섹션 사이 빈 줄, 날짜 사이는 `---`로 구분

**형식 (절대 변경 금지):**

```
### YYYY-MM-DD

**완료한 작업**
- 항목 (구체적으로, 한 줄에 하나씩)

**결정 사항**
- 항목 (왜 이렇게 했는지 짧게)

**미해결 이슈**
- 항목 (다음에 해야 할 것)

**다음 작업 후보**
- 항목 (우선순위 높은 것부터)
```

## 4. CLAUDE.md "최근 변경" 섹션 갱신

파일 위치: 프로젝트 루트 `CLAUDE.md`

규칙:
- `■ 최근 변경 (YYYY-MM-DD)` 섹션이 없으면 헤더 직후(첫 줄 빈 줄 뒤)에 새로 추가
- 이미 있으면 통째로 교체
- 본문은 1~3줄로 오늘 작업 헤드라인만 (상세 X)
- 다른 섹션은 절대 건드리지 않음

**형식:**

```
■ 최근 변경 (YYYY-MM-DD)
- 핵심 변경 1
- (선택) 핵심 변경 2
- (선택) 핵심 변경 3
```

## 5. 사용자 확인

journal.md / CLAUDE.md에 추가하거나 변경한 내용을 사용자에게 보여준 뒤
정확히 다음 메시지를 출력:

> **빠진 내용 있나요? 확인 후 'yes' 입력**

응답 처리:
- 사용자가 추가 항목을 알려주면 → journal.md / CLAUDE.md 다시 보강 후 재확인
- 사용자가 `yes`(또는 `Yes`/`YES`/`네`) 응답 시에만 6단계로 진행
- 그 외 응답은 보강·재확인 반복

## 6. 커밋·푸시

`yes` 받은 경우에만 다음을 순서대로 실행:

```bash
git add journal.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: YYYY-MM-DD 일일 정리

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- `YYYY-MM-DD`는 1단계에서 확정한 오늘 KST 날짜로 치환
- 커밋·푸시 중 실패 시 즉시 사용자에게 알리고 중단

## 7. 완료 메시지

성공 시 다음 형식으로 요약 출력:

```
✅ YYYY-MM-DD 일일 정리 완료
- journal.md: 완료 N건 / 결정 N건 / 미해결 N건 / 다음 후보 N건
- CLAUDE.md: 최근 변경 갱신
- 커밋 <hash> 푸시됨
```

---

## 주의 사항

- journal.md 형식은 본 문서에 명시된 4-카테고리 구조 — **절대 변경 금지**
- CLAUDE.md는 "최근 변경" 섹션만 수정하고 다른 섹션은 그대로 둔다
- 같은 날짜에 두 번 `/wrap-up` 시 기존 섹션 보강 (덮어쓰기 X, 중복 추가 X)
- 사용자가 `yes` 답하기 전엔 절대 git add/commit/push 하지 않는다
- 커밋 메시지 끝에 항상 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` 포함
