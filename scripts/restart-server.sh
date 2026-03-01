#!/usr/bin/env bash
set -e
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
nohup node packages/server/dist/index.js > /tmp/parlor-server.log 2>&1 &
SERVER_PID=$!
sleep 2
if curl -s -o /dev/null -w "" http://localhost:3000; then
  echo "Server running on :3000 (PID $SERVER_PID)"
else
  echo "FAILED to start server"
  cat /tmp/parlor-server.log
  exit 1
fi
