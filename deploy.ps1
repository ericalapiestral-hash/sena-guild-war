# 빌드 후 dist를 gh-pages 브랜치로 강제 푸시해서 GitHub Pages에 배포
$ErrorActionPreference = 'Stop'
npm run build
$remote = git remote get-url origin
Push-Location dist
try {
  git init -b gh-pages | Out-Null
  git add -A
  git commit -m "deploy $(Get-Date -Format yyyy-MM-dd_HHmm)" | Out-Null
  git push -f $remote gh-pages
} finally {
  Pop-Location
  Remove-Item -Recurse -Force dist\.git -ErrorAction SilentlyContinue
}
Write-Host "배포 완료 — 반영까지 1~2분 걸릴 수 있어요."
