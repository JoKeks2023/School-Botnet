# School-Botnet

Legales Schulprojekt fuer verteiltes Rechnen mit einem zentralen Server und mehreren Browser-Clients.

## MVP-Status

Diese erste Implementierung liefert ein lauffaehiges Grundgeruest:

- Admin Dashboard fuer Login, Raum erstellen, 8-stellige Join-Codes erzeugen, Demo-Task starten/stoppen
- Client-Oberflaeche fuer manuelles Joinen per Raumcode + Einmalcode
- Verteilung von Task-Chunks an Clients
- Rueckmeldung von Ergebnissen und Live-Status im Admin Dashboard
- Docker-Setup fuer Betrieb auf Raspberry Pi

## Architektur (MVP)

- Server: Node.js + Express + Socket.IO
- Deployment: Docker (ARM64-kompatibel)
- Admin: Browser auf MacBook
- Clients: Browser auf Windows 10 (manuell gestartet, danach unbeaufsichtigt)

## Sicherheitsmodell (MVP)

- Admin muss sich einloggen
- Join benoetigt zwei Codes:
  - 8-stelliger Raumcode
  - 8-stelliger Einmalcode (nur einmal nutzbar, mit TTL)
- Nur Admin kann Tasks starten/stoppen

## Schnellstart lokal

1. `.env` anlegen:

```bash
cp .env.example .env
```

1. Abhaengigkeiten installieren:

```bash
npm install
```

1. Server starten:

```bash
npm start
```

1. UIs aufrufen:

- Admin: `http://localhost:3000/admin`
- Client: `http://localhost:3000/client`

## Docker Start

```bash
docker compose up --build
```

Danach:

- Admin: `http://<raspberry-pi-ip>:3000/admin`
- Client: `http://<raspberry-pi-ip>:3000/client`

## Windows EXE Build

1. Build starten:

```bash
npm run build:exe:win
```

1. Ergebnis:

- `dist/school-botnet.exe`

Hinweis: Die EXE enthaelt den Node.js-Server und die statischen Dateien aus `public/`.

## Show-Ablauf (dein Setup)

1. Dashboard auf dem MacBook oeffnen
2. Mit Admin-Passwort einloggen
3. Raum erstellen
4. Fuer jeden Windows-PC einen Einmalcode erzeugen
5. Auf jedem PC Client-Seite oeffnen, Raumcode + Einmalcode eingeben
6. Wenn alle verbunden sind, Demo-Task starten
7. Live-Fortschritt im Dashboard beobachten

## Wichtige Hinweise

- Dieses Projekt ist fuer legale, transparente Demo- und Lernzwecke gedacht.
- Keine versteckte Ausfuehrung, keine Selbstverbreitung, keine Angriffsfunktionen.
- Der aktuelle MVP speichert Daten nur im Speicher (kein persistentes DB-Backend).

## Naechste Schritte

- Persistenz (SQLite/PostgreSQL)
- Robusteres Scheduling (Retry-Queue, Lost-Chunk-Recovery)
- Echte Worker-Auslagerung im Client (Web Worker)
- Kiosk-/Fullscreen-Optimierung fuer unbeaufsichtigte Show-Clients
