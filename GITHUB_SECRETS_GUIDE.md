# Setting up GitHub Actions Auto-Deployment

This guide explains how to set up continuous deployment from this GitHub repository to your Hostinger VPS.

## 1. Get Your Hostinger Server Credentials
You will need your server's IP address and root password.
- Log into Hostinger (hpanel.hostinger.com)
- Go to "VPS" and select your server.
- Note the **IP Address** (e.g. `89.117.22.45`)
- You will need your server's **root password** (the one you set up for SSH access).

## 2. Add Secrets to GitHub
We need to securely store these credentials in GitHub so the automated deployment bot can access your server.

1.  Open your repository on GitHub: [github.com/octoLAN/linguistflow](https://github.com/octoLAN/linguistflow)
2.  Click on **Settings** (the gear icon near the top right).
3.  In the left sidebar, scroll down to the "Security" section, expand **Secrets and variables**, and click on **Actions**.
4.  Click the green button **New repository secret**.

You need to create three separate secrets exactly as named below:

### Secret 1: Server IP
*   **Name:** `HOST`
*   **Secret:** `Deine Hostinger IP-Adresse` (z.B. `89.117.22.45`)
*   Click **Add secret**.

### Secret 2: Server Username
*   Click **New repository secret** again.
*   **Name:** `USERNAME`
*   **Secret:** `root`
*   Click **Add secret**.

### Secret 3: Server Password
*   Click **New repository secret** again.
*   **Name:** `PASSWORD`
*   **Secret:** `Dein VPS Passwort`
*   Click **Add secret**.

***

When you are done, you should see three secrets listed on that page: `HOST`, `PASSWORD`, and `USERNAME`.

**Tell me when you have added all three secrets to GitHub!** Then I will write the automation script for you.
