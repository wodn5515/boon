---
name: sync
description: main에서 hotfix가 머지된 후 stage 브랜치에 동기화가 필요할 때 사용한다. main의 변경사항을 stage에 반영하는 PR을 생성한다.
---

# main → stage 동기화

## 언제 사용하는가
- hotfix가 main에 머지된 후
- main에 직접 변경이 있은 후
- stage가 main보다 뒤처져 있을 때

## 절차

### 1. 상태 확인
```!
git fetch origin
git log --oneline origin/master..origin/stage
git log --oneline origin/stage..origin/master
```

- main에 있고 stage에 없는 커밋 확인
- 동기화가 필요한지 판단

### 2. 동기화 브랜치 생성
```bash
git checkout stage
git pull origin stage
git checkout -b sync/main-to-stage
```

### 3. main 변경사항 merge commit으로 반영
```bash
git merge origin/master --no-edit
```
- 충돌 발생 시 해결하고 커밋

### 4. PR 생성
- sync 브랜치 → stage로 PR 생성
- 제목: `[sync] main → stage 동기화`
- 본문에 동기화되는 커밋 목록 포함

## 주의
- rebase가 아닌 merge commit 사용 (협업 안전성)
- PR 머지는 사용자가 직접 수행
