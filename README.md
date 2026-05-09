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

Mit `network_mode: host` lauscht der Container auf dem Host-Port `${PORT:-8090}` und der konfigurierten Host-Adresse `HOST` (`0.0.0.0` im Compose-Standard). Wenn der Dienst öffentlich gebunden ist, muss er per Firewall oder Reverse Proxy geschützt werden. Nginx terminiert TLS und proxyt die Hauptdomain sowie den WebSocket-Pfad.

## GitLab Modulnews

GitLab Releases, Tags und gemergte Merge Requests können über den Webhook-Endpunkt veröffentlicht werden:

```text
POST /api/gitlab/events
```

Vor dem Start muss `GITLAB_WEBHOOK_SECRET` per `.env` oder Umgebung gesetzt werden:

```bash
GITLAB_WEBHOOK_SECRET=...
```

Der Header `X-Gitlab-Token` muss diesem Wert entsprechen. Ohne gesetztes Secret ist der Webhook deaktiviert und antwortet mit `503`. Der Server dedupliziert Ereignisse über eine externe Event-ID aus GitLab-Projekt und Event-Kennung, zum Beispiel Merge-Request-IID oder Tag-Name. Wiederholte Webhook-Zustellungen erzeugen keine doppelten News.

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
