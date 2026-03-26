# EXE Build and GitHub Release

## Local Build (Windows EXE)
```bash
npm install
npm run build:exe:win
```

Output file:
- `dist/school-botnet.exe`

## Optional Additional Targets
```bash
npm run build:exe:linux
npm run build:exe:mac
npm run build:exe:all
```

## Suggested Versioning
Use semantic version tags, for example:
- `v0.2.0`

## GitHub Release via CLI
Prerequisite:
- `gh` CLI installed and authenticated (`gh auth status`)

Example flow:
```bash
git tag v0.2.0
git push origin v0.2.0
gh release create v0.2.0 dist/school-botnet.exe --title "School-Botnet v0.2.0" --notes "Windows EXE build"
```

## Verification
- check release page contains asset `school-botnet.exe`
- download and verify startup on target machine
