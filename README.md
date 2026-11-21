# Лабораторные работы по Docker

Три работы: каждая запускается в своём Docker. Проверялись на виртуальной машине Alpine Linux.

## Подготовка

```sh
apk add docker docker-compose git
rc-update add docker default
rc-service docker start
```

## Проброс портов (VirtualBox)

- 8080 -> 8080 / TCP
- 20080 -> 80 / TCP

## 01-nginx: собственная страница в nginx
Образ на базе nginx:alpine со своей стартовой страницей (index.html).

```sh
cd 01-nginx
docker build -t my-nginx .
docker run -d --name my-nginx -p 8080:80 my-nginx
```
Адрес: http://127.0.0.1:8080/

## 02-docker-game: игра ZigZag тремя способами
Игра: https://github.com/michaelkolesidis/zigzag (Vite + React Three Fiber).
Репозиторий игры в каталог не входит, его нужно клонировать:

```sh
cd 02-docker-game
git clone https://github.com/michaelkolesidis/zigzag.git zigzag
```

Три Dockerfile:
- Dockerfile.1-prebuilt   - игра собрана заранее на хосте (pnpm build), в образ копируется готовый dist.
- Dockerfile.2-multistage - игра собирается при сборке образа (multi-stage), в итоговом образе только nginx и статика.
- Dockerfile.3-runtime    - игра собирается при старте контейнера.

~ Подход 1 (на хосте нужны nodejs, npm, pnpm):
```sh
cd zigzag && HUSKY=0 pnpm install --config.strict-dep-builds=false ; pnpm build ; cd ..
docker build -f Dockerfile.1-prebuilt -t game-prebuilt .
docker run -d --name game-prebuilt -p 8080:80 game-prebuilt
```

~ Подход 2:
```sh
docker build -f Dockerfile.2-multistage -t game-multistage .
docker run -d --name game-multistage -p 8080:80 game-multistage
```

~ Подход 3 (после запуска подождать 1-3 минуты, пока идёт сборка):
```sh
docker build -f Dockerfile.3-runtime -t game-runtime .
docker run -d --name game-runtime -p 8080:80 game-runtime
```

Контейнеры запускаются по очереди на одном порту: перед следующим подходом
предыдущий контейнер удаляется (docker rm -f <имя>).
Адрес: http://127.0.0.1:8080/

## 03-www-db: nginx + PHP-FPM + MySQL + PostgreSQL + Redis
Запуск через docker-compose. Страница показывает версии трёх баз данных.

```sh
cd 03-www-db
docker-compose up -d --build
docker-compose ps
```
Адрес: http://127.0.0.1/ (порт 80 на машине должен быть свободен)

Остановка: 
```sh
docker-compose down
```

## Полезное
Остановить и удалить контейнер: 
```sh
docker rm -f <имя>
```
Логи контейнера: 
```sh
docker logs <имя>
```
