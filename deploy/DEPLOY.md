# Запуск форка на проде

Адрес панели: **https://xkrvx5jhbw.drksha.com**

Схема: `интернет → Caddy (TLS, заголовки) → панель → Postgres`. Наружу открыты только порты 80 и 443
у Caddy. Панель и база в сети докера без публикации портов, база ещё и в сети без выхода наружу.

## Что здесь защищено и чем

| Что | Как |
|---|---|
| Трафик | HTTPS (Let's Encrypt, автообновление), HSTS, HTTP→HTTPS |
| Вход в панель | Лимит неудачных входов: 8 ошибок с адреса или 20 на логин за 15 минут — блок на 15 минут, повторные блоки удваивают срок (до 6 часов). Правильный пароль счётчик не трогает |
| Перебор API-токенов | Тот же лимит на неверные `Bearer`-токены |
| Второй пароль перед панелью (рекомендуется) | Caddy `basic_auth`: боты не видят страницу входа, а страницу первичной настройки нельзя занять до вас |
| Ключи провайдеров, токен Remnawave, токен Telegram | Хранятся в БД зашифрованными (AES-256-GCM), ключ `ENCRYPTION_KEY` только в `.env` на сервере. В API секреты не отдаются, раскрытие только из сессии владельца |
| API-токены панели | В БД только хэши; токен с правом `read` не может менять данные |
| Cookie сессии | `HttpOnly`, `Secure`, `SameSite=Strict` |
| Заголовки | CSP, X-Frame-Options, nosniff, Referrer-Policy, COOP/CORP, Permissions-Policy |
| Swagger (`/api/docs`) | Выключен и дополнительно закрыт в Caddy |
| Контейнеры | Не root, файловая система только для чтения, без capabilities, `no-new-privileges`, лимиты памяти и процессов |
| База | Не опубликована, пароль случайный (24 байта), scram-sha-256 |
| Remnawave-интеграция | Только https (http только для localhost и частных адресов), без редиректов, адрес проверяется в момент соединения (облачные метаданные `169.254.x` и link-local запрещены) |
| Секреты в логах | Токены и заголовки не логируются; Caddy скрывает `Cookie` и `Authorization` |

## 0. Что нужно

- VPS с Ubuntu 22.04/24.04 или Debian 12 (1 ГБ ОЗУ хватит), публичный IPv4, доступ по SSH.
- Docker Engine и Compose v2 (`docker compose version`).
- Управление DNS домена `drksha.com`.

## 1. DNS

В DNS `drksha.com` добавьте:

| Тип | Имя | Значение |
|---|---|---|
| A | `xkrvx5jhbw` | IPv4 вашего сервера |
| AAAA | `xkrvx5jhbw` | IPv6 (если есть) |
| CAA | `drksha.com` (или `xkrvx5jhbw`) | `0 issue "letsencrypt.org"` |

Если домен в Cloudflare, поставьте запись в режим **DNS only** (серая тучка): иначе Caddy увидит
адрес Cloudflare вместо клиента, и лимит входов будет общим для всех.
Имя поддомена попадёт в публичные логи сертификатов (Certificate Transparency): защита от этого не
зависит, но не считайте его секретом.

## 2. Сервер

Один раз, под root (замените `deploy` на своё имя пользователя):

```bash
# обновления безопасности автоматически
apt-get update && apt-get install -y unattended-upgrades ufw fail2ban git
dpkg-reconfigure -plow unattended-upgrades

# SSH только по ключу (сначала проверьте, что вход по ключу работает!)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh

# файрвол: SSH, HTTP (нужен для выпуска сертификата), HTTPS
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
```

Docker при публикации портов обходит ufw. Поэтому в `docker-compose.yml` наружу опубликованы
только порты Caddy (80/443); у панели и базы `ports:` нет вовсе.

## 3. Код

```bash
git clone --branch fork/topology https://github.com/hab3rmas/infra-billing.git /opt/infra-billing
cd /opt/infra-billing/deploy
```

(Ветку `fork/topology` нужно сначала запушить в ваш репозиторий: `git push -u origin fork/topology`.)

## 4. Секреты

```bash
./gen-secrets.sh        # создаст .env (chmod 600) со случайными паролем БД и ENCRYPTION_KEY
nano .env               # задайте ACME_EMAIL=вы@почта
```

Скрипт напечатает `ENCRYPTION_KEY`. **Сразу сохраните его в менеджер паролей**, не на этом
сервере. Без него бэкап базы не прочитать, а все сохранённые ключи провайдеров и токены станут
бесполезны. Менять его потом нельзя (перешифровки нет).

`APP_DOMAIN` в `.env` уже `xkrvx5jhbw.drksha.com`.

## 5. Второй пароль перед панелью (сделайте до первого запуска)

Пока вы не создали владельца, страница первичной настройки открыта любому, кто зайдёт на адрес
первым. Закройте её паролем Caddy:

```bash
docker run --rm -it caddy:2-alpine caddy hash-password     # введите пароль дважды, скопируйте хэш
cp caddy/extra/basic-auth.caddy.example caddy/extra/basic-auth.caddy
nano caddy/extra/basic-auth.caddy                          # вставьте хэш вместо PASTE_THE_BCRYPT_HASH_HERE
```

Логин для этого окна: `owner` (можно поменять в файле). Скрипты и MCP с заголовком
`Authorization: Bearer <токен>` на `/api/*` (кроме `/api/auth/*`) это окно не видят: их защищает сам
токен.

Ещё строже: разрешить доступ только с ваших адресов, см. `caddy/extra/ip-allowlist.caddy.example`.

## 6. Запуск

```bash
docker compose up -d --build
docker compose ps                 # все три сервиса: healthy / running
docker compose logs -f caddy      # должна появиться строка про выпущенный сертификат
```

Сборка образа занимает несколько минут. Миграции базы применяются при старте контейнера.

## 7. Первый вход

1. Откройте https://xkrvx5jhbw.drksha.com, введите пароль из шага 5.
2. Создайте владельца: **длинная парольная фраза** (20+ символов, уникальная).
3. **Настройки → Вход:** добавьте passkey (аппаратный ключ или Touch ID/Windows Hello) и проверьте,
   что входите им. Затем отключите вход по паролю: останется только passkey. (Если потеряете все
   passkey: `docker compose exec infra-billing cli enable-password` вернёт вход по паролю,
   `cli reset-admin -y` сбросит владельца.)
4. Не включайте лишние способы входа, которыми не пользуетесь.

## 8. Ключи: минимальные права

- **Ключи провайдеров:** создавайте с правами только на чтение (счета, серверы, платежи), если
  провайдер так умеет. Панели нужно только читать.
- **Токен Remnawave:** тоже читающий. Панель читает ноды, профили и хосты и ничего не меняет.
- **API-токены панели** (Настройки → API-токены): отдельный токен на каждого клиента, право `read`,
  если запись не нужна. Показывается один раз; отозвать можно там же.
- **Telegram:** отдельный бот для панели; чат с уведомлениями только для вас.

## 9. Бэкапы

Бэкап базы раз в сутки (под пользователем, у которого есть доступ к docker):

```bash
sudo mkdir -p /var/backups/infra-billing && sudo chown "$USER" /var/backups/infra-billing
crontab -e
# добавьте строку (03:17 каждый день):
17 3 * * * cd /opt/infra-billing/deploy && ./backup.sh >> /var/log/infra-billing-backup.log 2>&1
```

- Скрипт проверяет, что дамп читается, и хранит 14 дней (`KEEP_DAYS`).
- Копируйте каталог **за пределы сервера** (rclone/restic/scp на другой хост). С шифрованием:
  поставьте `age` и задайте `BACKUP_AGE_RECIPIENT=age1...`.
- В дампе нет `ENCRYPTION_KEY`: храните ключ отдельно (шаг 4).
- **Проверьте восстановление один раз** на другой машине или в тестовом стеке:
  `./restore.sh /путь/к/дампу.dump` (спросит подтверждение, заменяет данные).

## 10. Проверка, что всё защищено

```bash
D=xkrvx5jhbw.drksha.com
curl -sI https://$D | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer"
curl -sI http://$D | head -3                                  # 308 на https
curl -s -o /dev/null -w "%{http_code}\n" https://$D/api/docs  # 404 (или 401 из-за пароля Caddy)
docker compose exec infra-billing id                          # uid=1000(node), не root
docker compose exec infra-billing touch /app/x 2>&1 | tail -1 # Read-only file system
nmap -Pn -p- <IP сервера>                                     # снаружи открыты только 22, 80, 443
docker compose ps --format '{{.Service}}: {{.Ports}}'          # опубликованы порты только у caddy
```

Лимит входов: 10 раз подряд неверный пароль на странице входа даст ответ «Too many failed
attempts». Свой адрес потом снимет только время (или `docker compose restart infra-billing`,
счётчики в памяти).

Внешняя проверка TLS: https://www.ssllabs.com/ssltest/ (ожидается A/A+).

## 11. Обновление

```bash
cd /opt/infra-billing
./deploy/backup.sh                         # всегда перед обновлением: миграции необратимы
git pull
cd deploy && docker compose up -d --build
docker compose logs --tail 50 infra-billing   # «Migrations applied.»
```

Обновление от автора (upstream) смотрите в `FORK.md`, раздел «Updating from upstream». После
слияния прогоните тесты: `node --test apps/backend/fork-test/*.test.mjs` (для них нужна сборка:
`npm ci && npm run build`). Если тест `deploy-config` пишет, что хэш CSP устарел (автор изменил
маленький inline-скрипт темы в `index.html`), выполните `deploy/csp-hash.sh` и подставьте новый
`sha256-...` в `script-src` в `deploy/Caddyfile`, иначе страница после обновления останется без темы
и с ошибкой в консоли.

## 12. Если что-то пошло не так

| Ситуация | Что делать |
|---|---|
| Утёк `.env` или подозрение на компрометацию | Ключи провайдеров, токен Remnawave и Telegram перевыпустите на их сторонах и введите заново; смените пароль БД (`ALTER USER` + `.env` + перезапуск); `cli reset-admin -y` и создать владельца заново; отзовите API-токены |
| Забыли пароль, passkey потеряны | `docker compose exec infra-billing cli enable-password` или `cli reset-admin -y` |
| Заблокировал себя лимитом входов | `docker compose restart infra-billing` |
| Сертификат не выпускается | DNS ещё не указывает на сервер; порты 80/443 закрыты; запись в Cloudflare с проксированием. Логи: `docker compose logs caddy` |
| Нужно остановить всё | `docker compose down` (данные сохраняются), с `-v` удалит и базу |

## 13. Что остаётся риском

- Если сервер скомпрометирован целиком (root), `.env` с ключом шифрования лежит рядом с данными.
  Это общий недостаток схемы «ключ в окружении»; смягчение: отдельный сервер только под панель,
  вход по SSH-ключу, обновления, минимум других сервисов на нём.
- CSP разрешает один внешний адрес: шрифт флагов стран с jsDelivr (нужен только Windows-браузерам).
  Запросы к GitHub API (счётчик звёзд, проверка обновлений) заблокированы намеренно: панель не ходит
  в сторонние сервисы из браузера. Если нужен шрифт без CDN, скажите: его можно положить на свой домен.
- Лимит входов хранится в памяти процесса: перезапуск сбрасывает счётчики. Для особо
  параноидальной схемы используйте IP allow-list или VPN (Tailscale) вместо публичного адреса.
- Зависимости: после `npm audit fix` остаются находки в `@nestjs/swagger`, `multer`, `zod`,
  `nestjs-zod`. Они либо недостижимы из сети (Swagger выключен, загрузок файлов нет), либо требуют
  мажорного обновления Nest/Zod, которое ломает панель. Проверяйте `npm audit --omit=dev` при каждом
  обновлении от автора.
- Ключ шифрования ротировать нельзя; утечка = перевыпуск всех ключей провайдеров.
