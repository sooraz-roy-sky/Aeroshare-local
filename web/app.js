// AeroShare - Frontend Logic (Chunked Upload Engine, SSE Sync, Speed & UI Controls)

// Application State
const state = {
    theme: 'dark',
    connected: false,
    activeTransfers: {}, // key: uploadId, value: transfer object
    chunkSize: 4 * 1024 * 1024, // Default 4MB
    concurrency: 4, // Default 4 parallel workers
    serverUrl: window.location.origin
};

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const queueCard = document.getElementById('queue-card');
const queueCount = document.getElementById('queue-count');
const queueList = document.getElementById('queue-list');
const fileList = document.getElementById('file-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const copyUrlBtn = document.getElementById('copy-url-btn');
const connectionUrlInput = document.getElementById('connection-url');
const connectedCountText = document.getElementById('connected-count');
const connectionStatusText = document.getElementById('connection-status');
const connectionBadge = document.getElementById('connection-badge');
const chunkSizeSelect = document.getElementById('chunk-size-select');
const concurrencySelect = document.getElementById('concurrency-select');
const toastEl = document.getElementById('toast');

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    updateConnectionInfo();
    refreshFileList();
    startSSE();
});

// Theme Initialization
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    state.theme = savedTheme;
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
}

// Real-Time SSE (Server-Sent Events) Synchronization
function startSSE() {
    const ssePath = '/api/events';
    const eventSource = new EventSource(ssePath);

    eventSource.onopen = () => {
        state.connected = true;
        updateConnectionStatus(true);
    };

    eventSource.onerror = () => {
        state.connected = false;
        updateConnectionStatus(false);
    };

    eventSource.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'file_list_update') {
                updateSharedFilesUI(data.files);
            } else if (data.type === 'client_count') {
                updateClientCountUI(data.count);
            } else if (data.type === 'toast') {
                showToast(data.message);
            }
        } catch (err) {
            console.error('SSE Message parsing error:', err);
        }
    });
}

function updateConnectionStatus(isConnected) {
    if (isConnected) {
        connectionStatusText.textContent = 'Online (Local)';
        connectionBadge.classList.add('pulse-green');
    } else {
        connectionStatusText.textContent = 'Disconnected';
        connectionBadge.classList.remove('pulse-green');
        connectedCountText.textContent = '0 Devices';
    }
}

function updateClientCountUI(count) {
    connectedCountText.textContent = `${count} Device${count !== 1 ? 's' : ''}`;
}

// Update Server connection links & generate QR
function updateConnectionInfo() {
    // Read current host
    const localUrl = window.location.origin;
    connectionUrlInput.value = localUrl;
    
    // Attempt QR Code generation
    setTimeout(() => {
        const qrDiv = document.getElementById('qrcode');
        const placeholderDiv = document.getElementById('qrcode-placeholder');
        
        if (window.qrcodeLibFailed || typeof QRCode === 'undefined') {
            placeholderDiv.innerHTML = `
                <div class="qr-offline-notice">
                    <p style="color: var(--accent-cyan); font-weight:600;">Offline Mode</p>
                    <span style="font-size:11px; opacity:0.8;">QR library unavailable. Use URL directly.</span>
                </div>
            `;
            qrDiv.style.display = 'none';
        } else {
            try {
                qrDiv.innerHTML = '';
                new QRCode(qrDiv, {
                    text: localUrl,
                    width: 180,
                    height: 180,
                    colorDark : "#0a0a14",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });
                placeholderDiv.style.display = 'none';
                qrDiv.style.display = 'block';
            } catch (e) {
                console.error("QR Code library init error:", e);
                placeholderDiv.textContent = "Error rendering QR";
            }
        }
    }, 500);
}

// File List API Operations
async function refreshFileList() {
    try {
        const res = await fetch('/api/files');
        if (!res.ok) throw new Error('Failed to fetch file list');
        const files = await res.json();
        updateSharedFilesUI(files);
    } catch (err) {
        console.error('Error refreshing files:', err);
        showToast('Error loading shared files');
    }
}

function updateSharedFilesUI(files) {
    // Apply search filter if active
    const searchVal = searchInput.value.toLowerCase().trim();
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchVal));

    if (filteredFiles.length === 0) {
        fileList.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    fileList.innerHTML = '';

    filteredFiles.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';

        // Format Date
        const dateStr = new Date(file.uploadedAt * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Safe Filename Display (XSS Mitigation)
        const nameEl = document.createElement('span');
        nameEl.className = 'file-title';
        nameEl.textContent = file.name;

        // Size format
        const sizeStr = formatBytes(file.size);

        // Build File Icon based on type
        const iconSvg = getFileIcon(file.name);

        card.innerHTML = `
            <div class="file-card-info">
                <div class="file-icon">${iconSvg}</div>
                <div class="file-details">
                    <!-- File Title gets injected safely below -->
                    <div class="file-title-container"></div>
                    <div class="file-meta">
                        <span>${sizeStr}</span>
                        <span>•</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
            </div>
            <div class="file-card-actions">
                <a href="/api/download/${encodeURIComponent(file.name)}" class="icon-btn" title="Download" download="${file.name}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </a>
                <button class="icon-btn copy-file-link" data-filename="${file.name}" title="Copy Link">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </button>
                <button class="icon-btn delete-file-btn" data-filename="${file.name}" title="Delete" style="color: var(--danger);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `;

        // Inject the text-safe filename element
        card.querySelector('.file-title-container').appendChild(nameEl);
        fileList.appendChild(card);
    });

    // Wire up events for file card items
    document.querySelectorAll('.copy-file-link').forEach(btn => {
        btn.onclick = () => {
            const filename = btn.getAttribute('data-filename');
            const fileUrl = `${window.location.origin}/api/download/${encodeURIComponent(filename)}`;
            copyToClipboard(fileUrl, 'File link copied to clipboard!');
        };
    });

    document.querySelectorAll('.delete-file-btn').forEach(btn => {
        btn.onclick = async () => {
            const filename = btn.getAttribute('data-filename');
            if (confirm(`Are you sure you want to delete "${filename}"?`)) {
                await deleteFile(filename);
            }
        };
    });
}

async function deleteFile(filename) {
    try {
        const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed');
        showToast('File deleted successfully');
        refreshFileList();
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Failed to delete file');
    }
}

// HIGH-PERFORMANCE CHUNKED UPLOADING ENGINE
async function uploadFile(file) {
    const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Create new transfer tracking object
    const transfer = {
        id: uploadId,
        file: file,
        size: file.size,
        name: file.name,
        chunkSize: state.chunkSize,
        concurrency: state.concurrency,
        totalChunks: Math.ceil(file.size / state.chunkSize),
        chunksUploaded: 0,
        bytesUploaded: 0,
        speedHistory: [], // records of {time, bytes}
        speed: 0,
        eta: 0,
        status: 'starting',
        workers: [],
        isAborted: false
    };

    state.activeTransfers[uploadId] = transfer;
    updateQueueCardVisibility();
    createQueueItemUI(transfer);

    try {
        // Step 1: Handshake with Server (File Init)
        const initRes = await fetch('/api/upload/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                size: file.size,
                chunkSize: transfer.chunkSize
            })
        });

        if (!initRes.ok) {
            const errorMsg = await initRes.text();
            throw new Error(errorMsg || 'Handshake failed');
        }

        const initData = await initRes.json();
        const serverUploadId = initData.uploadId;
        transfer.serverUploadId = serverUploadId;
        transfer.status = 'uploading';
        updateQueueItemStatus(transfer, 'Uploading...');

        // Step 2: Queue chunks & run parallel workers
        const chunkIndicesQueue = [];
        for (let i = 0; i < transfer.totalChunks; i++) {
            chunkIndicesQueue.push(i);
        }

        // Initialize speed calculation intervals
        transfer.speedInterval = setInterval(() => calculateTransferSpeed(transfer), 1000);
        transfer.lastUpdateTime = Date.now();
        transfer.lastUploadedBytes = 0;

        // Run parallel worker threads
        const workersCount = Math.min(transfer.concurrency, transfer.totalChunks);
        const workerPromises = Array.from({ length: workersCount }, () => 
            runUploadWorker(transfer, chunkIndicesQueue)
        );

        // Wait for all workers to consume the chunk queue
        await Promise.all(workerPromises);

        if (transfer.isAborted) return;

        // Step 3: Complete handshake
        updateQueueItemStatus(transfer, 'Finalizing file on server...');
        const completeRes = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: serverUploadId })
        });

        if (!completeRes.ok) throw new Error('Server assembly failure');

        // Success state
        transfer.status = 'completed';
        clearInterval(transfer.speedInterval);
        markQueueItemSuccess(transfer);
        showToast(`"${file.name}" uploaded successfully!`);
        refreshFileList();

    } catch (err) {
        console.error('Upload error:', err);
        transfer.status = 'failed';
        clearInterval(transfer.speedInterval);
        markQueueItemFailure(transfer, err.message);
        showToast(`Failed to upload "${file.name}"`);
    }
}

// Single Upload Worker Thread
async function runUploadWorker(transfer, queue) {
    while (queue.length > 0 && !transfer.isAborted) {
        const chunkIndex = queue.shift();
        if (chunkIndex === undefined) break;

        const offset = chunkIndex * transfer.chunkSize;
        const end = Math.min(offset + transfer.chunkSize, transfer.size);
        const chunkBlob = transfer.file.slice(offset, end);
        const chunkSize = end - offset;

        let retryCount = 0;
        let success = false;

        while (retryCount < 3 && !success && !transfer.isAborted) {
            try {
                const res = await fetch('/api/upload/chunk', {
                    method: 'POST',
                    headers: {
                        'X-Upload-Id': transfer.serverUploadId,
                        'X-Chunk-Index': chunkIndex.toString(),
                        'X-Chunk-Offset': offset.toString(),
                        'X-Chunk-Size': chunkSize.toString()
                    },
                    body: chunkBlob
                });

                if (!res.ok) throw new Error(`Status ${res.status}`);
                
                success = true;
                transfer.chunksUploaded++;
                transfer.bytesUploaded += chunkSize;
                
                // Live Progress updates
                updateQueueItemProgress(transfer);
            } catch (err) {
                retryCount++;
                console.warn(`Retry chunk ${chunkIndex} (Attempt ${retryCount}/3) failed:`, err);
                if (retryCount >= 3) {
                    transfer.isAborted = true;
                    throw new Error(`Chunk ${chunkIndex} upload failed after 3 attempts.`);
                }
                // Small sleep before retry
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
}

// Calculate Upload Speed & ETA
function calculateTransferSpeed(transfer) {
    if (transfer.status !== 'uploading' || transfer.isAborted) return;

    const now = Date.now();
    const uploadedNow = transfer.bytesUploaded;
    const elapsedSec = (now - transfer.lastUpdateTime) / 1000;

    if (elapsedSec <= 0) return;

    const bytesSentSinceLast = uploadedNow - transfer.lastUploadedBytes;
    const currentSpeed = bytesSentSinceLast / elapsedSec; // bytes per sec

    // Apply moving average (smoothing)
    transfer.speed = transfer.speed === 0 ? currentSpeed : (transfer.speed * 0.7) + (currentSpeed * 0.3);

    transfer.lastUpdateTime = now;
    transfer.lastUploadedBytes = uploadedNow;

    // Estimate ETA
    const remainingBytes = transfer.size - uploadedNow;
    transfer.eta = transfer.speed > 0 ? remainingBytes / transfer.speed : 0;

    // Update Speed in UI
    const speedText = document.getElementById(`speed-${transfer.id}`);
    const etaText = document.getElementById(`eta-${transfer.id}`);
    
    if (speedText) speedText.textContent = `${formatBytes(transfer.speed)}/s`;
    if (etaText) {
        if (transfer.eta > 0) {
            etaText.textContent = `• ETA: ${formatSeconds(transfer.eta)}`;
        } else {
            etaText.textContent = '';
        }
    }
}

// Dynamic Progress UI Injections
function createQueueItemUI(transfer) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = `queue-item-${transfer.id}`;

    // Safe File Name (XSS prevention)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = transfer.name;

    item.innerHTML = `
        <div class="queue-item-meta">
            <!-- File name gets injected safely below -->
            <div class="name-container"></div>
            <span class="file-status-text" id="status-${transfer.id}">Preparing...</span>
        </div>
        <div class="progress-container">
            <div class="progress-bar" id="bar-${transfer.id}"></div>
        </div>
        <div class="queue-item-stats">
            <span id="percent-${transfer.id}">0%</span>
            <span>
                <span class="transfer-speed" id="speed-${transfer.id}">0 B/s</span>
                <span id="eta-${transfer.id}"></span>
            </span>
        </div>
    `;

    item.querySelector('.name-container').appendChild(nameSpan);
    queueList.appendChild(item);
    updateQueueCardVisibility();
}

function updateQueueItemProgress(transfer) {
    const percent = Math.min(100, Math.round((transfer.bytesUploaded / transfer.size) * 100));
    
    const bar = document.getElementById(`bar-${transfer.id}`);
    const percentText = document.getElementById(`percent-${transfer.id}`);
    
    if (bar) bar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
}

function updateQueueItemStatus(transfer, statusText) {
    const status = document.getElementById(`status-${transfer.id}`);
    if (status) status.textContent = statusText;
}

function markQueueItemSuccess(transfer) {
    const item = document.getElementById(`queue-item-${transfer.id}`);
    if (item) {
        item.style.borderColor = 'var(--success)';
        const status = document.getElementById(`status-${transfer.id}`);
        if (status) {
            status.textContent = 'Completed';
            status.style.color = 'var(--success)';
        }
        const speed = document.getElementById(`speed-${transfer.id}`);
        if (speed) speed.textContent = 'Finished';
        const eta = document.getElementById(`eta-${transfer.id}`);
        if (eta) eta.textContent = '';
        
        // Remove from UI after a short delay
        setTimeout(() => {
            item.remove();
            delete state.activeTransfers[transfer.id];
            updateQueueCardVisibility();
        }, 5000);
    }
}

function markQueueItemFailure(transfer, errorMsg) {
    const item = document.getElementById(`queue-item-${transfer.id}`);
    if (item) {
        item.style.borderColor = 'var(--danger)';
        const status = document.getElementById(`status-${transfer.id}`);
        if (status) {
            status.textContent = 'Failed';
            status.style.color = 'var(--danger)';
        }
        const speed = document.getElementById(`speed-${transfer.id}`);
        if (speed) speed.textContent = errorMsg;
        const eta = document.getElementById(`eta-${transfer.id}`);
        if (eta) eta.textContent = '';
    }
}

function updateQueueCardVisibility() {
    const activeCount = Object.keys(state.activeTransfers).length;
    queueCount.textContent = `${activeCount} File${activeCount !== 1 ? 's' : ''}`;
    
    if (activeCount > 0) {
        queueCard.classList.remove('hidden');
    } else {
        queueCard.classList.add('hidden');
    }
}

// User Actions & Event Listeners
function setupEventListeners() {
    // Theme toggle
    themeToggle.onclick = () => {
        if (state.theme === 'dark') {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            state.theme = 'light';
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            state.theme = 'dark';
            localStorage.setItem('theme', 'dark');
        }
    };

    // Drag-and-Drop file uploads
    dropZone.onclick = () => fileInput.click();
    fileInput.onclick = (e) => e.stopPropagation();
    fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            Array.from(e.target.files).forEach(uploadFile);
        }
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    };

    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(uploadFile);
        }
    };

    // Settings adjustments
    chunkSizeSelect.onchange = (e) => {
        state.chunkSize = parseInt(e.target.value);
    };

    concurrencySelect.onchange = (e) => {
        state.concurrency = parseInt(e.target.value);
    };

    // Search bar filter
    searchInput.oninput = () => {
        refreshFileList();
    };

    // Refresh button
    refreshBtn.onclick = () => {
        refreshFileList();
    };

    // Copy connection URL
    copyUrlBtn.onclick = () => {
        copyToClipboard(connectionUrlInput.value, 'Server connection URL copied to clipboard!');
    };
}

// Helpers
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatSeconds(secs) {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

function copyToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
    }).catch(err => {
        console.error('Clip copy error:', err);
        showToast('Failed to copy link automatically');
    });
}

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    
    // Hide toast after 3s
    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 3000);
}

// File SVG icons mapping helper
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    // Default document icon
    let path = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>`;
    
    const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
    const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'];
    const archiveExtensions = ['zip', 'rar', 'tar', 'gz', '7z'];
    
    if (mediaExtensions.includes(ext)) {
        // Image Icon
        path = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>`;
    } else if (videoExtensions.includes(ext)) {
        // Video Icon
        path = `<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>`;
    } else if (archiveExtensions.includes(ext)) {
        // Zip/Archive Icon
        path = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line><path d="M12 7h3"></path><path d="M9 11h3"></path><path d="M12 15h3"></path>`;
    }
    
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
