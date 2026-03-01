# LinguistFlow Hostinger VPS Deployment Guide

This guide covers deploying LinguistFlow to a Hostinger Virtual Private Server (VPS) running Ubuntu with Docker installed.

## Prerequisites

1.  A **Hostinger VPS** (not shared hosting, as you need full Docker support).
2.  A domain name pointing to your VPS IP address (via DNS A Records).
3.  SSH access to your VPS.

## Step 1: Connect to your VPS

Open your terminal and connect to your VPS via SSH:

```bash
ssh root@your_vps_ip_address
```

*(You can find your IP address and root password in the Hostinger VPS Dashboard)*

## Step 2: Install Git & Docker (if not already installed)

Hostinger typically provides OS templates with Docker pre-installed. If it's not, you can install it:

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose
sudo systemctl enable --now docker
```

## Step 3: Clone the Repository

Clone your LinguistFlow code onto the server:

```bash
git clone https://github.com/your-username/linguistflow.git
cd linguistflow
```

*Note: Replace the URL with your actual Git repository URL. If the repo is private, you will need to set up a deploy key or use personal access tokens.*

## Step 4: Configure Environment Variables

We've provided a standard production template. Copy it and fill in your details:

```bash
cp .env.example .env
nano .env
```

Make sure you update all values, especially:
- `POSTGRES_PASSWORD`
- `SECRET_KEY` (Generate a long random string)
- Your external API keys (Gemini, OpenAlex, Pexels, etc.)
- `FRONTEND_ORIGIN` (Your domain name, e.g., `https://yourdomain.com`)

Press `CTRL+O` to save, `Enter` to confirm, and `CTRL+X` to exit nano.

## Step 5: Start the Application

We've included a script to build and start everything in production mode:

```bash
chmod +x deploy.sh
./deploy.sh
```

This will run `docker-compose -f docker-compose.prod.yml up -d --build`.
It will start:
- PostgreSQL database
- Redis instance
- FastAPI Backend (on port `8000` internally)
- Celery Worker
- Celery Beat Scheduler
- Nginx frontend (serving React on port `80`)

## Step 6: Verify Deployment

Check if the containers are running securely:

```bash
docker ps
```

You should now be able to access the frontend via your VPS IP address or domain name `http://your_vps_ip_address`.

## Optional: Set up HTTPS (SSL) with Nginx/Certbot

To secure your site with HTTPS, it's recommended to set up a reverse proxy on the host machine or use Cloudflare. If you use Cloudflare, you can point your domain to the VPS IP and enable Flexible or Full SSL in the Cloudflare dashboard without needing Certbot.

## Updating the Application

Whenever you push new code to your repository, simply SSH into your server and run:

```bash
cd linguistflow
./deploy.sh
```

This will pull the latest code, rebuild the required containers, and restart the service with zero to minimal downtime.
