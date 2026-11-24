# Checkpoint Geo Studio — VPS deployment and recovery

## Architecture and source of truth

- **GitHub** is the permanent source of truth for framework code, dashboard code, scripts, configuration templates, key project documents/manifests, preview MP4s and approved final MP4s.
- **VPS** is replaceable compute. It holds the Git checkout, active project folders, render tools, dashboard and temporary render outputs. Remotion, FFmpeg, narration, transcription, previews and final renders run on the VPS, never on the 4 GB Windows laptop.
- **Windows workstation** is the permanent archive destination for completed project folders. Pull the entire project folder after production and verify it before deleting anything from the VPS.
- Completed project folders do **not** need cloud object storage.
- YouTube uploads are never automatic. A human approves each specific video before upload.

## Current VPS

Inspected only; no installation has been run:
- Ubuntu 22.04.5 LTS, x86_64, 6 vCPUs, 15 GiB RAM, 79 GiB disk
- IPv4: `38.180.243.115`
- Domain: `studio.checkpointgeo.nx.kg` resolves to that IPv4
- SSH on port 22; UFW was inactive at inspection
- App checkout: `/srv/video-project`
- Unprivileged app account: `checkpoint`
- DNS is ready; Caddy will obtain HTTPS automatically when the service is installed.

## One-command first deployment (Windows)

Run this from the existing local `video-project` checkout:

```powershell
.\scripts\server\deploy-to-vps.ps1 -Server root@38.180.243.115
```

The launcher checks that the local working tree is clean, fetches and switches to the selected branch automatically, uploads the bootstrap and runs it on the VPS. The bootstrap:
1. Creates the unprivileged `checkpoint` account and its dedicated Ed25519 deploy key.
2. Installs Node.js 24, Python, CMake, Git LFS, Chrome/Remotion libraries and fonts.
3. Installs FFmpeg 9.0.1 static Linux x86_64 and checks `loudnorm`, `ebur128`, `sidechaincompress` and `blackdetect`.
4. Creates a 4 GiB swap safety net.
5. Allows SSH, HTTP and HTTPS before enabling UFW.

**One-time GitHub action:** the first run prints the VPS public key. Add it at GitHub → `Kipcolehoward-star/video-project` → Settings → Deploy keys, with **Allow write access** enabled. Write access is needed for VPS project checkpoints. The private key stays on the VPS and is never committed. Then run the same PowerShell command again.

The second run clones/updates the selected branch, fetches Git LFS objects, runs `npm ci`, prepares `edge-tts`, installs Remotion Chrome Headless Shell, downloads Linux Piper and voice models, builds pinned whisper.cpp tag `b5454`, and runs TypeScript and speech-tool checks. It then installs the dashboard systemd service and Caddy HTTPS reverse proxy.

On first dashboard installation, two random credentials are generated and printed once:
- `owner`: full control, preview/final approvals and final checkpoint
- `agent`: project preparation, validation, previews, QC and Source/Preview GitHub checkpoints

Save both passwords. Give the agent password to the agent through a secure channel. Only password hashes are stored in `/etc/checkpoint-video/dashboard.env`; a root-only recovery copy is kept at `/etc/checkpoint-video/dashboard.env.initial.txt` until you delete it after saving the passwords.

After this infrastructure PR is merged, deploy from `main` by passing `-Branch main`.

## Checkpoint Geo Studio dashboard

URL: **https://studio.checkpointgeo.nx.kg**

The dashboard is served by `checkpoint-dashboard.service` on localhost port 3100; Caddy handles public HTTPS. State and logs live under `/var/lib/checkpoint-video`.

Role rules:
- Both owner and agent can view projects, review preview/final MP4s, validate, render previews, run QC, and push Source/Preview checkpoints.
- Only the owner can approve a preview, start a final render, approve a final output, or push the final checkpoint.
- The owner can approve a preview only after that preview has been pushed to GitHub.
- A final render is locked to the approved preview and the exact Git commit used to render it. If the preview or source commit changes, a fresh preview and approval are required.
- Final approval requires a successful QC job after the latest final render.
- Final MP4 checkpointing requires the final approval.
- There is no automatic YouTube publishing action.

## Project checkpoint policy (VPS → GitHub)

The dashboard queues the VPS-side helper; it can also be run directly as the app user:

```bash
cd /srv/video-project
runuser -u checkpoint -- bash scripts/server/push-project-checkpoint.sh <project-id> Source
runuser -u checkpoint -- bash scripts/server/push-project-checkpoint.sh <project-id> Preview
# Only after owner approval and successful final QC:
runuser -u checkpoint -- bash scripts/server/push-project-checkpoint.sh <project-id> Final --owner-approved
```

- **Source:** key project documents/manifests and small captions/credits/upload metadata.
- **Preview:** Source files plus preview MP4s via Git LFS, before owner review.
- **Final:** preview MP4s plus final output MP4s via Git LFS, only after explicit approval and QC.
- Arbitrary source media, caches, render chunks, secrets, `node_modules` and local tools are not automatically staged.
- Git LFS storage and bandwidth quotas apply. If GitHub rejects an LFS upload, stop and resolve the quota; never silently skip the preview/final.

## Completed project archive (VPS → Windows)

After a project is stable and no render is writing into it:

```powershell
.\scripts\server\pull-from-server.ps1 -Server root@38.180.243.115 -Project <project-id>
```

The default remote root is `/srv/video-project`. The script archives the complete `projects/<id>` folder, transfers it, verifies SHA-256, checks for `project.json`, and installs it locally. It refuses to overwrite an existing local project unless `-Force` is supplied; forced replacement first renames the old local folder to a timestamped backup. Keep the VPS copy until you inspect the local archive.

## Rebuilding after VPS loss

1. Provision a replacement Ubuntu 22.04 x86_64 VPS and point `studio.checkpointgeo.nx.kg` to its IPv4.
2. Run `deploy-to-vps.ps1` with the new server IP. Add the newly printed deploy key to GitHub and rerun.
3. Restore each active project from the local `projects/<id>` archive:

   ```powershell
   .\scripts\server\restore-project-to-server.ps1 -Server root@NEW_SERVER_IP -Project <project-id>
   ```

   The restore helper verifies SHA-256 before extraction and refuses to overwrite an existing remote project unless `-Force` is supplied. With `-Force`, the old remote folder is renamed as a backup.
4. Restore other required API credentials from the secure secret backup, never from Git.
5. Run project validation and a small preview render before resuming production.
6. Verify dashboard access, GitHub checkpoint push, full archive pull and deployment manifest.

## Safety and known limits

- Never delete the only copy of a project.
- Never trust SCP success alone; verify SHA-256.
- Never overwrite local or remote project data without an explicit backup decision.
- Keep secrets, OAuth tokens and private SSH keys outside Git.
- Never automatically publish a video.
- The scripts are committed but the actual VPS bootstrap, first render, Git LFS quota and restore process have **not** been run or runtime-verified yet.
