const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const projectList = document.getElementById('project-list');
const jobList = document.getElementById('job-list');
const toastNode = document.getElementById('toast');
let currentUser = null;
let toastTimer = null;

async function api(url, options) {
  const response = await fetch(url, Object.assign({credentials: 'same-origin', headers: {'Content-Type': 'application/json'}}, options || {}));
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function showToast(message, isError) {
  toastNode.textContent = message;
  toastNode.className = 'toast visible' + (isError ? ' toast-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.className = 'toast'; }, 4200);
}
function showLogin() {
  currentUser = null;
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
}
function showApp(user) {
  currentUser = user;
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('role-pill').textContent = user.role === 'owner' ? 'OWNER' : 'AGENT';
}
function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
function actionButton(label, action, projectId, disabled) {
  const button = make('button', 'action-button', label);
  button.type = 'button';
  button.disabled = Boolean(disabled);
  button.addEventListener('click', () => queueAction(projectId, action));
  return button;
}
async function queueAction(projectId, action) {
  try {
    await api('/api/jobs', {method: 'POST', body: JSON.stringify({projectId, action})});
    showToast('Added to render queue.');
    await refreshAll();
  } catch (error) { showToast(error.message, true); }
}
async function approve(projectId, kind) {
  try {
    const result = await api('/api/projects/' + encodeURIComponent(projectId) + '/approve-' + kind, {method: 'POST'});
    showToast(result.message || 'Approval saved.');
    await refreshAll();
  } catch (error) { showToast(error.message, true); }
}
function mediaPanel(label, media, approved) {
  const panel = make('div', 'media-panel');
  const head = make('div', 'media-head');
  head.append(make('span', 'media-label', label));
  if (approved) head.append(make('span', 'approved-pill', 'APPROVED'));
  panel.append(head);
  if (media) {
    const video = make('video', 'video-player');
    video.controls = true;
    video.preload = 'metadata';
    video.src = media.url;
    panel.append(video);
    const meta = make('div', 'media-meta');
    meta.append(make('span', '', media.name));
    meta.append(make('span', '', formatBytes(media.size)));
    panel.append(meta);
    panel.append(make('p', 'media-date', 'Updated ' + formatDate(media.updatedAt)));
  } else {
    panel.append(make('div', 'media-empty', 'No render available yet.'));
  }
  return panel;
}
function renderProject(project) {
  const card = make('article', 'project-card');
  const header = make('div', 'project-header');
  const heading = make('div', 'project-title');
  heading.append(make('h3', '', project.title));
  heading.append(make('p', 'project-id', project.id + ' · ' + project.format));
  header.append(heading);
  const status = project.finalApproved ? 'Final approved' : project.previewApproved ? 'Preview approved' : project.preview ? 'Ready for review' : 'Not rendered';
  header.append(make('span', 'status-pill', status));
  card.append(header);

  const mediaGrid = make('div', 'media-grid');
  mediaGrid.append(mediaPanel('LATEST PREVIEW', project.preview, project.previewApproved));
  mediaGrid.append(mediaPanel('FINAL OUTPUT', project.final, project.finalApproved));
  card.append(mediaGrid);

  const actions = make('div', 'project-actions');
  actions.append(actionButton('Validate', 'validate', project.id, false));
  actions.append(actionButton('Render preview', 'preview', project.id, false));
  actions.append(actionButton('Checkpoint source', 'checkpoint-source', project.id, false));
  actions.append(actionButton('Push preview to GitHub', 'checkpoint-preview', project.id, !project.preview));
  if (currentUser.role === 'owner') {
    const approvePreview = make('button', 'action-button owner-action', project.previewApproved ? 'Preview approved' : 'Approve preview');
    approvePreview.type = 'button';
    approvePreview.disabled = !project.preview || project.previewApproved;
    approvePreview.addEventListener('click', () => approve(project.id, 'preview'));
    actions.append(approvePreview);
    actions.append(actionButton('Render final', 'final', project.id, !project.previewApproved));
    actions.append(actionButton('Run final QC', 'qc', project.id, !project.final));
    const approveFinal = make('button', 'action-button owner-action', project.finalApproved ? 'Final approved' : 'Approve final');
    approveFinal.type = 'button';
    approveFinal.disabled = !project.final || project.finalApproved;
    approveFinal.addEventListener('click', () => approve(project.id, 'final'));
    actions.append(approveFinal);
    actions.append(actionButton('Push approved final', 'checkpoint-final', project.id, !project.finalApproved));
  } else {
    actions.append(make('p', 'permission-note', 'Owner approval is required before final rendering and final checkpoints.'));
  }
  card.append(actions);
  return card;
}
function renderJob(job) {
  const card = make('article', 'job-card');
  const top = make('div', 'job-top');
  top.append(make('strong', '', job.action.replaceAll('-', ' ')));
  top.append(make('span', 'job-status status-' + job.status, job.status));
  card.append(top);
  card.append(make('p', 'job-project', job.projectId + ' · requested by ' + job.requestedBy));
  card.append(make('p', 'job-date', formatDate(job.createdAt)));
  if (job.completedAt) card.append(make('p', 'job-date', 'Finished ' + formatDate(job.completedAt)));
  const logButton = make('button', 'text-button', 'View output');
  logButton.type = 'button';
  logButton.addEventListener('click', async () => {
    try {
      const result = await api('/api/jobs/' + job.id + '/logs');
      const dialog = document.getElementById('log-dialog');
      document.getElementById('log-title').textContent = job.projectId + ' · ' + job.action;
      document.getElementById('log-content').textContent = result.log || 'No output recorded yet.';
      dialog.showModal();
    } catch (error) { showToast(error.message, true); }
  });
  card.append(logButton);
  return card;
}
async function refreshAll() {
  const [projects, jobs] = await Promise.all([api('/api/projects'), api('/api/jobs')]);
  projectList.replaceChildren();
  if (!projects.length) projectList.append(make('div', 'empty-state', 'No projects found in /projects yet.'));
  else projects.forEach((project) => projectList.append(renderProject(project)));
  document.getElementById('project-count').textContent = projects.length + (projects.length === 1 ? ' project' : ' projects');
  jobList.replaceChildren();
  if (!jobs.length) jobList.append(make('div', 'empty-state', 'No jobs in the queue yet.'));
  else jobs.forEach((job) => jobList.append(renderJob(job)));
  document.getElementById('queue-count').textContent = jobs.length + (jobs.length === 1 ? ' job' : ' jobs');
  const active = jobs.find((job) => job.status === 'running');
  document.getElementById('system-label').textContent = active ? 'Rendering ' + active.projectId : 'Render queue ready';
}
async function boot() {
  try {
    const user = await api('/api/session');
    showApp(user);
    await refreshAll();
  } catch { showLogin(); }
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const user = await api('/api/login', {method: 'POST', body: JSON.stringify({username, password})});
    document.getElementById('password').value = '';
    showApp(user);
    await refreshAll();
  } catch (error) { loginError.textContent = error.message; }
});
document.getElementById('logout-button').addEventListener('click', async () => {
  await api('/api/logout', {method: 'POST'}).catch(() => {});
  showLogin();
});
document.getElementById('refresh-button').addEventListener('click', () => refreshAll().catch((error) => showToast(error.message, true)));
document.getElementById('close-log').addEventListener('click', () => document.getElementById('log-dialog').close());
boot();
setInterval(() => { if (currentUser) refreshAll().catch(() => {}); }, 5000);
