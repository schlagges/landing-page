# schnick-schnack.info Landing Page

Öffentliches Diensteportal für `schnick-schnack.info` mit Live-Health-Status über WebSocket.

## Entwicklung

```bash
npm install
npm run build
npm start
```

Die App läuft standardmäßig auf Port `8080`.

## Persistenz

Der Server nutzt SQLite für Berechtigungsanfragen, Monitoring-Verlauf und automatisch veröffentlichte GitLab-Modulnews.

Standardpfad lokal:

```bash
data/landing-page.sqlite
```

Im Container wird der Pfad über `SQLITE_DB_PATH` gesetzt und durch `./data:/app/data` persistent gehalten.

## Betrieb

```bash
docker compose up -d --build
```

Der Container veröffentlicht den Dienst lokal auf `127.0.0.1:8090`. Nginx terminiert TLS und proxyt die Hauptdomain sowie den WebSocket-Pfad.

## GitLab Modulnews

GitLab Releases, Tags und gemergte Merge Requests können über den Webhook-Endpunkt veröffentlicht werden:

```text
POST /api/gitlab/events
```

Der Header `X-Gitlab-Token` muss `GITLAB_WEBHOOK_SECRET` entsprechen. Der Server dedupliziert Ereignisse über eine externe Event-ID. Wiederholte Webhook-Zustellungen erzeugen keine doppelten News.

Unsichere oder Cross-Origin-URLs werden nicht veröffentlicht. Release- und Tag-Delete-Events werden ignoriert.

## Nginx aktivieren

Auf dem Server läuft der Container ohne öffentliche Portfreigabe per Host-Networking. Für die Hauptdomain sind einmalig privilegierte Nginx/Certbot-Schritte nötig:

```bash
sudo cp deploy/nginx-schnick-schnack.info.bootstrap.conf /etc/nginx/sites-available/schnick-schnack.info
sudo ln -sf /etc/nginx/sites-available/schnick-schnack.info /etc/nginx/sites-enabled/schnick-schnack.info
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d schnick-schnack.info -d www.schnick-schnack.info
sudo cp deploy/nginx-schnick-schnack.info.conf /etc/nginx/sites-available/schnick-schnack.info
sudo nginx -t
sudo systemctl reload nginx
```
