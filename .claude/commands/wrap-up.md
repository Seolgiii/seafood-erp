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

## 4.5. 옵시디언 vault 동기화

조건: `~/seafood-erp/obsidian-vault` 폴더가 존재할 때만 실행 (없으면 조용히 스킵)

이 단계는 격리 실행 — 4.5 안의 어떤 동기화가 실패하더라도 5단계 사용자 확인은 정상 진행한다. 절대 /wrap-up 자체를 멈추지 않는다.

### 4.5-A: CLAUDE.md → 00_프로젝트_현황.md 미러링

조건: 4단계에서 CLAUDE.md가 변경됐을 때만 (변경 없으면 스킵)
동작:
- 대상 파일: `~/seafood-erp/obsidian-vault/00_프로젝트_현황.md`
- 첫 줄 미러 안내문구는 항상 유지:

```
> 이 노트는 CLAUDE.md의 미러 (자동 동기화)

[CLAUDE.md 전체 내용 그대로]
```

### 4.5-B: z.Mission_for_all_term.md → 01_비전과_미해결결정.md 미러링

조건: `z.Mission_for_all_term.md` 가 이번 세션에 변경됐을 때만 (변경 없으면 스킵)
동작:
- 대상 파일: `~/seafood-erp/obsidian-vault/01_비전과_미해결결정.md`
- 첫 줄 미러 안내문구는 항상 유지:

```
> 이 노트는 z.Mission의 미러 (자동 동기화)

[z.Mission_for_all_term.md 전체 내용 그대로]
```

### 4.5-C: journal.md 오늘 항목 → 10_작업일지/{YYYY-MM-DD}.md 분리 저장

조건: 항상 (3단계에서 journal.md에 오늘 날짜 섹션이 추가/보강된 경우)
동작:
- `journal.md` 에서 `### {오늘날짜}` 섹션부터 다음 `---` 또는 다음 `### ` 직전까지 추출
- 대상 파일: `~/seafood-erp/obsidian-vault/10_작업일지/{YYYY-MM-DD}.md`
- 형식 변환:
  - `### 2026-05-07` → `# 2026-05-07`
  - `**완료한 작업**` → `## 완료`
  - `**결정 사항**` → `## 결정`
  - `**미해결 이슈**` → `## 미해결`
  - `**다음 작업 후보**` → `## 다음 후보`
- 같은 날짜 파일이 이미 있으면 **덮어쓰기** (journal.md가 이미 보강 처리한 결과를 그대로 반영)

### 4.5 안전장치 (필수)

bash 함수로 격리 실행. 어떤 sub-step이 실패해도 전체 흐름은 계속 진행:

```bash
sync_obsidian() {
  local vault="$HOME/seafood-erp/obsidian-vault"

  if [ ! -d "$vault" ]; then
    return 0  # vault 없으면 조용히 스킵
  fi

  # 4.5-A, 4.5-B, 4.5-C 각각 시도. 하나가 실패해도 다음 단계 시도.
  # 각 sub-step 안에서 || true 로 개별 격리.
  ...
}

sync_obsidian || echo "⚠️ 옵시디언 동기화 일부 실패 (기존 흐름 계속 진행)" >&2
```

→ 실패해도 절대 /wrap-up 자체를 멈추지 않음. 5단계 사용자 확인으로 그대로 이어진다.

## 5. 사용자 확인

journal.md / CLAUDE.md에 추가하거나 변경한 내용을 사용자에게 보여준 뒤
정확히 다음 메시지를 출력:

> **빠진 내용 있나요? journal.md, CLAUDE.md, 옵시디언 vault(있는 경우)를 확인 후 'yes' 입력**

응답 처리:
- 사용자가 추가 항목을 알려주면 → journal.md / CLAUDE.md 다시 보강 후 재확인
- 사용자가 `yes`(또는 `Yes`/`YES`/`네`) 응답 시에만 6단계로 진행
- 그 외 응답은 보강·재확인 반복

## 6. 커밋·푸시

`yes` 받은 경우에만 다음을 순서대로 실행:

```bash
git add journal.md CLAUDE.md
# 옵시디언 vault가 존재하면 변경분도 함께 stage (.gitignore가 캐시는 이미 제외)
[ -d "$HOME/seafood-erp/obsidian-vault" ] && git add obsidian-vault/
git commit -m "$(cat <<'EOF'
docs: YYYY-MM-DD 일일 정리

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- `YYYY-MM-DD`는 1단계에서 확정한 오늘 KST 날짜로 치환
- 커밋·푸시 중 실패 시 즉시 사용자에게 알리고 중단
- 옵시디언 vault 변경분이 있으면 함께 커밋되며, 변경 없으면 git이 자동으로 빈 stage로 처리

## 7. 완료 메시지

성공 시 다음 형식으로 요약 출력:

```
✅ YYYY-MM-DD 일일 정리 완료
- journal.md: 완료 N건 / 결정 N건 / 미해결 N건 / 다음 후보 N건
- CLAUDE.md: 최근 변경 갱신
- 옵시디언: 작업일지·현황 동기화 완료 / 변경 없음 / vault 없음 (스킵) 중 하나
- 커밋 <hash> 푸시됨
```

---

## 주의 사항

- journal.md 형식은 본 문서에 명시된 4-카테고리 구조 — **절대 변경 금지**
- CLAUDE.md는 "최근 변경" 섹션만 수정하고 다른 섹션은 그대로 둔다
- 같은 날짜에 두 번 `/wrap-up` 시 기존 섹션 보강 (덮어쓰기 X, 중복 추가 X)
- 사용자가 `yes` 답하기 전엔 절대 git add/commit/push 하지 않는다
- 커밋 메시지 끝에 항상 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` 포함
- 옵시디언 동기화(4.5)는 격리 실행 — 실패해도 1~7단계 흐름은 정상 진행
- vault 없으면 4.5는 조용히 스킵 (경고 출력 없음)
