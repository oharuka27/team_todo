#!/bin/bash
cd backend
echo "=== Testing Backend API ==="
echo ""
echo "1. Health check:"
curl -s http://localhost:8787/health | jq . || echo "Backend not ready yet"
echo ""
echo ""
echo "2. Creating a project:"
curl -s -X POST http://localhost:8787/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"テストプロジェクト","user_id":"user123"}' | jq . || echo "Backend not ready"
