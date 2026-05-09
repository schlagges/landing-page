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

Im Container wird der Pfad über `PORTAL_DB_PATH` gesetzt und durch `./data:/app/data` persistent gehalten. `SQLITE_DB_PATH` bleibt als Legacy-Fallback unterstützt; Docker Compose übernimmt den Wert, wenn `PORTAL_DB_PATH` nicht gesetzt ist.

## Betrieb

```bash
docker compose up -d --build
```

Mit `network_mode: host` lauscht der Container auf dem Host-Port `${PORT:-8090}` und der konfigurierten Host-Adresse `HOST`. Der Compose-Standard bindet an `127.0.0.1`, passend zur Nginx-Proxy-Konfiguration auf `127.0.0.1:8090`. Wenn Betreiber `HOST=0.0.0.0` setzen, ist der Port direkt über Host-Interfaces erreichbar und muss per Firewall, Reverse Proxy oder vergleichbaren Zugriffskontrollen geschützt werden.

## GitLab Modulnews

GitLab Releases, Tags und gemergte Merge Requests können über den Webhook-Endpunkt veröffentlicht werden:

```text
POST /api/gitlab/events
```

Vor dem Start muss `GITLAB_WEBHOOK_SECRET` per `.env` oder Umgebung gesetzt werden:

```bash
GITLAB_BASE_URL=https://labs.schnick-schnack.info
GITLAB_WEBHOOK_SECRET=...
```

`GITLAB_BASE_URL` definiert den erlaubten GitLab-Ursprung für veröffentlichte Links. Der Header `X-Gitlab-Token` muss `GITLAB_WEBHOOK_SECRET` entsprechen. Ohne gesetztes Secret ist der Webhook deaktiviert und antwortet mit `503`. Der Server dedupliziert Ereignisse über eine externe Event-ID aus GitLab-Projekt und Event-Kennung, zum Beispiel Merge-Request-IID oder Tag-Name. Wiederholte Webhook-Zustellungen erzeugen keine doppelten News.

Unsichere oder Cross-Origin-URLs werden nicht veröffentlicht. Release- und Tag-Delete-Events werden ignoriert.

## Nginx aktivieren

Auf dem Server läuft der Container per Host-Networking mit Loopback-Bindung, sodass Nginx lokal auf `127.0.0.1:8090` proxyt. Host-Networking macht Listener nicht automatisch privat; die Bind-Adresse `HOST` und die Firewall-Regeln bestimmen die direkte Erreichbarkeit. Für die Hauptdomain sind einmalig privilegierte Nginx/Certbot-Schritte nötig:

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
