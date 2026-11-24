# VPS migration and project archive

## Architecture and source of truth

- **GitHub** is the permanent source of truth for framework code, scripts, configuration templates, key project documents/manifests, preview MP4s and approved final MP4s.
- **VPS** is replaceable compute. It holds the Git checkout, active project folders, render tools and temporary render outputs. Rendering never runs on the 4 GB Windows laptop.
- **Windows workstation** is the permanent archive destination for completed project folders. Pull the entire project folder after production and verify it before deleting anything from the VPS.
- Completed project folders do **not** need cloud object storage.
- YouTube uploads are never automatic. A human approves each specific video before upload.

## Current VPS

Inspected only; no installation has been run:
- Ubuntu 22.04.5 LTS, x86_64, 6 vCPUs, 15 GiB RAM, 79 GiB disk
- IPv4: `38.180.243.115`
- Domain: `studio.checkpointgeo.nx.kg` resolves to that IPv4
- SSH on port 22; UFW was inactive at inspection
- App checkout path: `/srv/video-project`
- App account: `checkpoint` (unprivileged)
- Domain DNS is ready; HTTPS and the dashboard are not configured.

## First deployment (Windows)

Run from a clean local checkout of this repository, on the same branch you intend to deploy:

```powershell
git switch infra/vps-migration-and-project-archive
git pull --ff-only origin infra/vps-migration-and-project-archive
.\scripts\server\deploy-to-vps.ps1 -Server root@38.180.243.115
```

The PowerShell launcher:
1. Uploads and runs the Ubuntu 22.04 bootstrap.
2. Installs Node.js 24, Remotion runtime libraries/fonts, Git LFS, Python, FFmpeg 9.0.1 static Linux x86_64, 4 GiB swap and UFW rules (SSH/80/443 are allowed before UFW is enabled).
3. Creates the unprivileged `checkpoint` account and its SSH deploy key.
4. Prints the public key and attempts the private repository checkout.

**One-time GitHub action:** add the printed public key at GitHub → `Kipcolehoward-star/video-project` → Settings → Deploy keys, with **Allow write access** enabled. Write access is needed because the VPS pushes the requested project checkpoints to GitHub. The private key remains on the VPS and is never committed. Then run the same PowerShell command again.

The checkout helper clones or fast-forward-updates the selected branch, fetches Git LFS objects, runs `npm ci`, prepares the `edge-tts` Python venv, installs Remotion's Chrome Headless Shell and runs TypeScript checks. It records the deployed commit and tool versions in `/var/lib/checkpoint-video/deployment-manifest.txt`.

The launcher requires the local working tree to be clean and the checked-out branch to match the `-Branch` parameter. After this infrastructure PR is merged, deploy from `main` by switching to `main` and passing `-Branch main`.

## Project checkpoint policy (VPS → GitHub)

Run as the unprivileged app account from the VPS:

```bash
cd /srv/video-project
bash scripts/server/push-project-checkpoint.sh <project-id> Source
bash scripts/server/push-project-checkpoint.sh <project-id> Preview
# Only after the owner explicitly approves this preview and final QC passes:
bash scripts/server/push-project-checkpoint.sh <project-id> Final --owner-approved
```

- **Source:** key project documents/manifests and small captions/credits/upload metadata.
- **Preview:** Source files plus preview MP4s via Git LFS, before asking the owner to review.
- **Final:** preview MP4s plus final output MP4s via Git LFS. The explicit flag is required and must only be used after approval and QC.
- Arbitrary source media, caches, render chunks, secrets, `node_modules` and local tools are not automatically staged.
- Git LFS storage and bandwidth quotas apply. If GitHub rejects an LFS upload, stop and resolve the quota; never silently skip the preview/final.

The checkpoint script refuses pre-staged index changes and verifies that only the named project's files are included.

## Completed project archive (VPS → Windows)

After the project is stable and no render is writing into it:

```powershell
.\scripts\server\pull-from-server.ps1 -Server root@38.180.243.115 -Project <project-id>
```

The default remote root is `/srv/video-project`. The script creates a complete compressed archive of `projects/<id>`, transfers it, verifies SHA-256, checks for `project.json`, and installs the local folder. It refuses to overwrite an existing local project unless `-Force` is supplied; forced replacement first renames the old local folder to a timestamped backup. Keep the VPS copy until you have inspected the local archive.

## Rebuilding after VPS loss

1. Provision a replacement Ubuntu 22.04 x86_64 VPS and point `studio.checkpointgeo.nx.kg` to its IPv4.
2. From the Windows repository checkout, run the same `deploy-to-vps.ps1` command with the new server IP. Add the new deploy key to GitHub and rerun.
3. Restore each active project from the local `projects/<id>` archive using the restore script (added separately in this branch).
4. Run project validation and a small preview render on the VPS before resuming production.
5. Restore required API credentials from the secure secret store/backup, never from Git.
6. Reconfigure HTTPS and the dashboard only after the dashboard application source and its authentication/role design are available.
7. Verify the deployment manifest and test archive pull before treating the replacement server as production-ready.

## Dashboard status / scope boundary

The inspected `video-project` repository contains the Remotion/FFmpeg production engine and server scripts, but no dashboard application, API, authentication layer, user/agent roles, render queue service or dashboard systemd unit. The bootstrap intentionally does not invent or deploy these. The dashboard must be added from its actual source repository/project before this domain can serve it.

## Safety

- Never delete the only copy of a project.
- Never trust SCP success alone; verify SHA-256.
- Never overwrite local or remote project data without an explicit backup decision.
- Keep secrets, OAuth tokens and private SSH keys outside Git.
- Never automatically publish a video.
- Keep infrastructure code changes on a feature branch, test them, then merge to `main`.
- The VPS is not production-ready until the bootstrap, test render, checkpoint push, archive pull and rebuild restore have all been tested.
