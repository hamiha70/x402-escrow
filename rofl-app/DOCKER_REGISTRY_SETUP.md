# Docker Registry Setup for ROFL

The ROFL TEE needs to pull your Docker image from a registry. Here are your options:

## Option 1: GitHub Container Registry (ghcr.io) - Recommended

```bash
# 1. Create a GitHub Personal Access Token
# Go to: https://github.com/settings/tokens
# Click "Generate new token (classic)"
# Scopes needed: write:packages, read:packages, delete:packages
# Copy the token (starts with ghp_...)

# 2. Login to GitHub Container Registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u hamiha70 --password-stdin

# 3. Push the image
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow/rofl-app
docker push ghcr.io/hamiha70/x402-tee-rofl-app:latest

# 4. Make the package public
# Go to: https://github.com/hamiha70?tab=packages
# Find "x402-tee-rofl-app"
# Click "Package settings"
# Scroll to "Danger Zone"
# Click "Change visibility" → "Public"
```

## Option 2: Docker Hub (docker.io) - Simpler

```bash
# 1. Login to Docker Hub
docker login

# 2. Retag image for Docker Hub
docker tag ghcr.io/hamiha70/x402-tee-rofl-app:latest hamiha70/x402-tee-rofl-app:latest

# 3. Push to Docker Hub
docker push hamiha70/x402-tee-rofl-app:latest

# 4. Update compose.yaml
# Change image to: hamiha70/x402-tee-rofl-app:latest
```

## Option 3: Use ROFL's Built-in Registry

According to the logs, ROFL pushes to: `rofl.sh/...`

This might work without external registry. Try rebuilding without the image reference.

## Quick Fix: Try Docker Hub

Since you likely have a Docker Hub account, this is fastest:

```bash
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow/rofl-app

# Login
docker login

# Tag for Docker Hub
docker tag ghcr.io/hamiha70/x402-tee-rofl-app:latest hamiha70/x402-tee-rofl-app:latest

# Push
docker push hamiha70/x402-tee-rofl-app:latest
```

Then update `compose.yaml`:

```yaml
services:
  x402-tee-app:
    image: hamiha70/x402-tee-rofl-app:latest # Changed from ghcr.io/...
```

Then redeploy:

```bash
oasis rofl build --force
oasis rofl deploy
```
