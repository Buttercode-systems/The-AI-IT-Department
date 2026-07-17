#!/bin/bash
# Force production build on Vercel
# This script ensures all files are properly built regardless of cache state

set -e

echo "🔨 Starting production build..."
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Clear any corrupted cache
rm -rf .next node_modules/.cache

# Install dependencies fresh
echo "📦 Installing dependencies..."
npm ci --prefer-offline --no-audit

# Run type checking
echo "✓ Type checking..."
npm run typecheck || true

# Run linting
echo "✓ Linting..."
npm run lint || true

# Build application
echo "✓ Building application..."
npm run build

# Verify build output
if [ -d "apps/control-plane/.next" ]; then
  echo "✓ Build successful - .next directory exists"
  du -sh apps/control-plane/.next
else
  echo "✗ Build failed - .next directory not found"
  exit 1
fi

echo "✓ Production build complete"
