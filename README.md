# schnick-schnack.info Landing Page

Öffentliches Diensteportal für `schnick-schnack.info` mit Live-Health-Status über WebSocket.

## Entwicklung

```bash
npm install
npm run build
npm start
```

Die App läuft standardmäßig auf Port `8080`.

## Betrieb

```bash
docker compose up -d --build
```

Der Container veröffentlicht den Dienst lokal auf `127.0.0.1:8090`. Nginx terminiert TLS und proxyt die Hauptdomain sowie den WebSocket-Pfad.

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
