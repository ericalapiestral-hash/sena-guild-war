# 빌드 후 dist를 gh-pages 브랜치로 강제 푸시해서 GitHub Pages에 배포
#
# ★ dist 안에 매번 새 git 저장소를 만드는 방식이라, 저장소 루트의 .gitignore 가
#   여기엔 하나도 안 걸린다. public/ 에 실수로 넣어 둔 백업 JSON(길드원 실명·점수)이나
#   소스맵이 있으면 git add -A 가 군말 없이 담아 공개 저장소로 밀어 올린다.
#   그래서 (1) 올리기 전에 확장자를 검사하고, (2) .git 정리 실패를 경고로 드러낸다.
$ErrorActionPreference = 'Stop'

npm run build
if ($LASTEXITCODE -ne 0) { throw '빌드 실패 — 배포를 중단합니다. (옛 dist 가 그대로 올라가는 걸 막습니다)' }

$remote = git remote get-url origin

# 지난 배포의 찌꺼기가 남아 있으면 커밋이 계속 쌓인다 — 시작 전에도 한 번 턴다
Remove-Item -Recurse -Force dist\.git -ErrorAction SilentlyContinue
if (Test-Path dist\.git) { throw 'dist\.git 를 못 지웠습니다. 파일을 잡고 있는 프로그램을 닫고 다시 시도하세요.' }

# 올라가면 안 되는 것들 — 있으면 멈춘다
$bad = Get-ChildItem -Path dist -Recurse -File |
  Where-Object { $_.Extension -in '.map', '.bak', '.env', '.log' -or $_.Name -like 'backup-*' -or $_.Name -like '*.key' }
if ($bad) {
  $bad | ForEach-Object { Write-Host "  $($_.FullName)" }
  throw '위 파일이 dist 에 있습니다. 공개 저장소로 올라가니 먼저 정리하세요.'
}

Push-Location dist
try {
  git init -b gh-pages | Out-Null
  git add -A
  git commit -m "deploy $(Get-Date -Format yyyy-MM-dd_HHmm)" | Out-Null
  git push -f $remote gh-pages
} finally {
  Pop-Location
  Remove-Item -Recurse -Force dist\.git -ErrorAction SilentlyContinue
  if (Test-Path dist\.git) {
    Write-Warning 'dist\.git 를 못 지웠습니다 — 직접 지우세요. 그냥 두면 다음 배포부터 커밋이 쌓여, 잠깐 올렸다 지운 파일도 히스토리에서 복원됩니다.'
  }
}
Write-Host "배포 완료 — 반영까지 1~2분 걸릴 수 있어요."
