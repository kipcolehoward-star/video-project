# VPS migration and project archive

This document describes the intended recovery model for the video production VPS.

## Architecture

- **GitHub** is the source of truth for framework code, scripts, configuration templates and documented project metadata.
- **VPS** is replaceable compute. It holds the active working tree, active project folders, render tools, temporary render outputs and the production dashboard.
- **Windows workstation** is the permanent archive destination for completed project folders. Pull the complete folder and verify it before marking the server copy archived or deleting anything.
- Completed project folders are **not required to live in cloud object storage**.

## Safety rules

1. Never delete the only copy of a project.
2. Never treat a successful SCP exit code as proof of a complete archive; verify SHA-256.
3. Do not overwrite a local project folder without an explicit backup/replace decision.
4. Keep secrets out of Git. Restore them from a separately maintained secure record; never put API keys, OAuth tokens or private SSH keys in this repository.
5. Do not automatically publish videos. A human must approve each specific video before upload.
6. Keep framework changes on a feature branch, test them, then merge to `main`.

## Full project archive from VPS to Windows

The PowerShell script `scripts/server/pull-from-server.ps1` is being upgraded to download the complete `projects/<id>` folder.

Example (run from the repository root on Windows):

```powershell
.\scripts\server\pull-from-server.ps1 -Server root@YOUR_SERVER_IP -Project YOUR_PROJECT_ID
```

The script should only be used after the project is in a stable state and no render process is actively writing files into it. It creates a compressed archive on the server, transfers it, verifies its SHA-256 hash, checks for `project.json`, and then installs the folder locally. If the local destination already exists, it stops unless `-Force` is explicitly supplied; forced replacement first renames the existing local folder to a timestamped backup.

After a successful pull, inspect the local project and confirm that the expected assets, audio, previews and output files are present. Do not delete the VPS copy until that review is complete.

## VPS rebuild procedure (planned)

The current VPS has been inspected: Ubuntu 22.04.5 LTS, x86_64, 6 vCPUs, 15 GiB RAM, 79 GiB disk with about 73 GiB free. `studio.checkpointgeo.nx.kg` resolves to the VPS IPv4, outbound GitHub HTTPS works, SSH listens on port 22, UFW is inactive, and no application service is listening yet.

The existing `setup-ubuntu.sh` was written for Ubuntu 24.04+ and must not be run unchanged. A separate `prepare-ubuntu-22.04.sh` now prepares the base OS, creates the unprivileged `checkpoint` account, installs Node.js 24 and base Chrome/font/Python dependencies, creates `/srv/video-project`, and configures a 4 GiB swap safety net. It deliberately does not clone the repo, install FFmpeg, alter the firewall, configure secrets, or expose a public service. It has been committed but has not yet been run or tested on the VPS.

The migration implementation must:

1. Confirm OS version, CPU, RAM, disk and network before changing the machine.
2. Create a dedicated unprivileged application account; do not run the dashboard or render jobs as root.
3. Install pinned/verified Node, FFmpeg, Chrome Headless Shell dependencies, Python environments and fonts.
4. Clone the private repository using a narrowly scoped deploy credential or another approved GitHub authentication method.
5. Check out a specified branch/commit and install dependencies from the lockfile.
6. Restore required secrets and service credentials from a secure source outside Git.
7. Restore active project folders from a verified local archive or an explicitly selected transfer source.
8. Run environment checks, project validation and a small test render before enabling the dashboard or queue.
9. Configure HTTPS, firewall rules, process supervision, logs and restart-on-boot.
10. Record the deployed commit, machine details and test results.

## Current implementation status

- [x] Create isolated infrastructure branch.
- [x] Replace the output-only pull script with a full-project archive workflow.
- [ ] Add a separate file-manifest verification report after extraction.
- [x] Define selective Git tracking for key project source files plus preview/final MP4s via Git LFS.
- [x] Add a selective checkpoint helper with separate Source, Preview and Final stages.
- [ ] Add an automated project checkpoint/push command and validate Git LFS quota/availability.
- [ ] Add a safe GitHub-based deployment script.
- [x] Add a dedicated Ubuntu 22.04 base-preparation script (execution and validation still pending).
- [ ] Pin and verify the FFmpeg build against the production pipeline's required filters/options.
- [ ] Configure firewall rules safely (preserve SSH access before enabling UFW).
- [ ] Add a repeatable server migration/rebuild script.
- [ ] Add dashboard, user roles and background render queue.
- [ ] Test the complete pull and restore process end to end.

Do not consider the VPS migration process production-ready until the unchecked items are implemented and tested on a disposable server.
