# School-Botnet

Legales Schulprojekt fuer verteiltes Rechnen mit einem zentralen Server und mehreren Browser-Clients.

## Was Ist Das?

School-Botnet ist ein transparentes Demo-System fuer Unterricht und Workshops.

Du bekommst:

- ein Admin-Dashboard zum Steuern und Beobachten
- mehrere Browser-Clients, die Chunks verarbeiten
- Live-Status via Socket.IO
- einfachen Betrieb lokal, per Docker oder als Windows-EXE

## Kernfunktionen

- Admin-Login mit Passwort
- Raum-Erstellung mit 8-stelligem Raumcode
- Einmalcodes (TTL + nur einmal nutzbar) fuer Client-Join
- Task-Start/Stop mit Chunk-Verteilung
- Heartbeat-basiertes Online/Offline-Tracking

## Tech Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: Vanilla HTML/CSS/JS
- Deployment: Docker + docker-compose
- Packaging: `pkg` fuer EXE-Builds

## Schnellstart (Lokal)

```bash
cp .env.example .env
npm install
npm start
```

Dann im Browser:

- Admin: `http://localhost:3000/admin`
- Client: `http://localhost:3000/client`

## Schnellstart (Docker)

```bash
docker compose up --build -d
```

Dann im Browser:

- Admin: `http://<server-ip>:3000/admin`
- Client: `http://<server-ip>:3000/client`

## EXE Builds

Windows:

```bash
npm run build:exe:win
```

Weitere Targets:

```bash
npm run build:exe:linux
npm run build:exe:mac
npm run build:exe:all
```

Output:

- `dist/school-botnet.exe`
- `dist/school-botnet-linux`
- `dist/school-botnet-macos`

## Doku-Index

- [Product Scope](docs/PRODUCT_SCOPE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Specification](docs/API_SPEC.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Windows 10 Client Setup](docs/WIN10_CLIENT_SETUP.md)
- [Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [EXE Build and Release](docs/EXE_BUILD_AND_RELEASE.md)

## Show-Ablauf (Empfohlen)

1. Admin-Dashboard oeffnen und einloggen.
2. Raum erstellen.
3. Pro Client einen Einmalcode ausgeben.
4. Clients beitreten lassen.
5. Task starten und Fortschritt beobachten.
6. Task kontrolliert stoppen und Session abschliessen.

## Sicherheits- und Ethik-Hinweis

- Nur fuer legale, transparente Lehr- und Demo-Zwecke.
- Keine versteckte Ausfuehrung.
- Keine Selbstverbreitung.
- Keine Angriffsfunktionen.

## Projektstatus

MVP: lauffaehig mit In-Memory-Statusverwaltung.

Geplante naechste Ausbaustufen:

- persistente Datenhaltung
- robustere Chunk-Recovery
- Worker-Auslagerung im Client
- weiter optimierter Kiosk-Betrieb
